
"""
bot/telegram_bot.py
------------------------------------------------------------------------------
Python-версія бота підтримки/затримок Kharkiv GO — ОПЦІЙНА альтернатива
`.github/workflows/telegram-bot.yml` (`frontend/scripts/process-telegram-bot.mjs`),
для тих, у кого є VPS / домашній сервер і хочеться миттєвих (не раз на ~3 год)
відповідей адміна та миттєвої появи банера про затримку.

Повністю кнопковий інтерфейс — команди руками вводити не треба:

    Користувачі (приватний чат із ботом) бачать постійну клавіатуру:
        📣 Повідомити про затримку   — кілька тапів (вид → номер маршруту)
        🔎 Перевірити маршрут        — чи є зараз затримка на маршруті
        📋 Активні затримки          — список усіх активних оголошень
        💬 Підтримка                 — написати повідомлення адміну
        ℹ️ Допомога

        (кнопки в Mini App шлють приховано-тегований текст "#delay:..#" —
         бот і далі розпізнає це як структуровану скаргу на затримку, для
         сумісності)

    Адміни (ADMIN_CHAT_IDS) бачать додаткові кнопки:
        📢 Оголосити затримку   — вид → маршрут (або "усі") → готовий шаблон
                                   часу (~15/~30/~60 хв) або свій текст
        📋 Активні оголошення   — список із кнопкою "🗑 Скасувати" біля кожного
        📊 Статистика            — короткий дашборд (скарги, оголошення, черга)
        Reply на переслане звернення   — відповідь іде користувачу
        Inline-кнопка під авто-запитом — підтвердити оголошення в 1 тап

    Команди /start і /help лишаються робочими для сумісності, але керувати
    ботом повністю можна кнопками, без набору тексту команд.

Стійкість/якість:
    - усі записи стану пишуться атомарно (tmp-файл + os.replace), щоб SIGKILL
      або збій мережі посеред запису не побив дані;
    - виклики Telegram API мають ретраї з експоненційним бекофом;
    - є проста антиспам-логіка (rate limit) на скарги/звернення від одного
      користувача, щоб один "жартівник" не міг сам собі накрутити поріг
      оголошення затримки або завалити адмінів;
    - SIGINT/SIGTERM зупиняють цикл акуратно (без обриву посеред запису).

Працює з ТИМИ Ж файлами даних, що й Actions-версія
(`frontend/data-runtime/*.json`, `frontend/public/data/route-alerts.json`) —
можна вільно перемикатись між підходами або тримати обидва одночасно
(Telegram getUpdates з offset унеможливлює подвійну обробку одного апдейту).

Після кожної обробленої пачки апдейтів скрипт комітить і пушить зміни в git,
щоб вони долетіли до задеплоєного на GitHub Pages сайту (вимикається
змінною AUTO_GIT_PUSH=false).

Встановлення:
    cd bot
    python3 -m venv venv && source venv/bin/activate
    pip install -r requirements.txt
    cp .env.example .env    # вписати BOT_TOKEN і ADMIN_CHAT_IDS
    python telegram_bot.py
------------------------------------------------------------------------------
"""
from __future__ import annotations

import json
import logging
import os
import re
import signal
import subprocess
import time
import uuid
from pathlib import Path
from typing import Any, Optional

import requests
from dotenv import load_dotenv

import supabase_sync
from fcm_notify import notify_delay_subscribers

load_dotenv()

# --- конфігурація ------------------------------------------------------------

BOT_TOKEN = os.getenv("BOT_TOKEN", "")
ADMIN_CHAT_IDS = [int(x) for x in os.getenv("ADMIN_CHAT_IDS", "").replace(" ", "").split(",") if x]

DELAY_REPORT_THRESHOLD = int(os.getenv("DELAY_REPORT_THRESHOLD", "5"))
DELAY_REPORT_WINDOW_MINUTES = int(os.getenv("DELAY_REPORT_WINDOW_MINUTES", "60"))
DELAY_ALERT_DURATION_HOURS = float(os.getenv("DELAY_ALERT_DURATION_HOURS", "2"))

POLL_TIMEOUT_SECONDS = int(os.getenv("POLL_TIMEOUT_SECONDS", "30"))
AUTO_GIT_PUSH = os.getenv("AUTO_GIT_PUSH", "true").lower() not in ("false", "0", "no")

# Антиспам: мінімальний інтервал між двома скаргами/зверненнями від ОДНОГО
# й того ж користувача (секунди). Захищає від накрутки порогу оголошення
# затримки й від флуду в адмінський чат.
USER_RATE_LIMIT_SECONDS = int(os.getenv("USER_RATE_LIMIT_SECONDS", "20"))

# Скільки хвилин "живе" незавершений діалог (вибір кнопками), поки бот не
# скине його й не попросить почати спочатку.
PENDING_ACTION_TTL_MINUTES = int(os.getenv("PENDING_ACTION_TTL_MINUTES", "15"))

LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO").upper()

# За замовчуванням цей файл лежить у <repo>/bot/telegram_bot.py, а дані — в
# <repo>/frontend/... — REPO_ROOT можна перевизначити змінною середовища,
# якщо структура інша (напр. запускаєте скрипт окремо від репозиторію).
REPO_ROOT = Path(os.getenv("REPO_ROOT", Path(__file__).resolve().parent.parent))
FRONTEND_DIR = REPO_ROOT / "frontend"
RUNTIME_DIR = FRONTEND_DIR / "data-runtime"
PUBLIC_ALERTS_PATH = FRONTEND_DIR / "public" / "data" / "route-alerts.json"

OFFSET_FILE = RUNTIME_DIR / "bot-offset.json"
DELAY_REPORTS_FILE = RUNTIME_DIR / "delay-reports.json"
SUPPORT_MAP_FILE = RUNTIME_DIR / "support-map.json"
PENDING_PROMPTS_FILE = RUNTIME_DIR / "pending-alert-prompts.json"
RATE_LIMIT_FILE = RUNTIME_DIR / "rate-limits.json"
PENDING_ACTIONS_FILE = RUNTIME_DIR / "pending-user-actions.json"

KIND_LABELS = {
    "bus": "Автобус",
    "trolleybus": "Тролейбус",
    "tram": "Трамвай",
    "metro": "Метро",
}
KIND_EMOJI = {
    "bus": "🚌",
    "trolleybus": "🚎",
    "tram": "🚊",
    "metro": "🚇",
}
KIND_ORDER = ["bus", "trolleybus", "tram", "metro"]

# Готові шаблони орієнтовного часу затримки для швидкого оголошення адміном.
DELAY_PRESETS_MINUTES = [15, 30, 60]

API_BASE = f"https://api.telegram.org/bot{BOT_TOKEN}"

logging.basicConfig(
    level=getattr(logging, LOG_LEVEL, logging.INFO),
    format="%(asctime)s %(levelname)-7s %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger("kharkivgo-bot")


# --- постійні кнопки меню (ReplyKeyboard) ------------------------------------

BTN_REPORT_DELAY = "📣 Повідомити про затримку"
BTN_CHECK_ROUTE = "🔎 Перевірити маршрут"
BTN_ACTIVE_ALERTS = "📋 Активні затримки"
BTN_SUPPORT = "💬 Підтримка"
BTN_HELP = "ℹ️ Допомога"

BTN_ADMIN_ALERT = "📢 Оголосити затримку"
BTN_ADMIN_ALERTS = "📋 Активні оголошення"
BTN_ADMIN_STATS = "📊 Статистика"

BTN_CANCEL = "❌ Скасувати"


def main_menu_keyboard(is_admin: bool) -> dict:
    rows = [
        [BTN_REPORT_DELAY, BTN_CHECK_ROUTE],
        [BTN_ACTIVE_ALERTS, BTN_SUPPORT],
    ]
    if is_admin:
        rows.append([BTN_ADMIN_ALERT, BTN_ADMIN_ALERTS])
        rows.append([BTN_ADMIN_STATS, BTN_HELP])
    else:
        rows.append([BTN_HELP])
    return {"keyboard": rows, "resize_keyboard": True, "is_persistent": True}


def cancel_only_keyboard() -> dict:
    return {"keyboard": [[BTN_CANCEL]], "resize_keyboard": True, "is_persistent": True}


def cancel_inline_keyboard() -> dict:
    return {"inline_keyboard": [[{"text": "❌ Скасувати", "callback_data": "flow_cancel"}]]}


def kind_inline_keyboard(prefix: str, *, allow_any: bool = True) -> dict:
    rows = [
        [{"text": f"{KIND_EMOJI[k]} {KIND_LABELS[k]}", "callback_data": f"{prefix}:{k}"} for k in KIND_ORDER[:2]],
        [{"text": f"{KIND_EMOJI[k]} {KIND_LABELS[k]}", "callback_data": f"{prefix}:{k}"} for k in KIND_ORDER[2:]],
    ]
    if allow_any:
        rows.append([{"text": "🌐 Будь-який вид транспорту", "callback_data": f"{prefix}:-"}])
    rows.append([{"text": "❌ Скасувати", "callback_data": "flow_cancel"}])
    return {"inline_keyboard": rows}


# --- маленькі хелпери роботи з JSON-файлами стану ---------------------------

def read_json(path: Path, fallback: Any) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError) as e:
        if isinstance(e, json.JSONDecodeError):
            log.warning("Пошкоджений JSON у %s (%s) — використовую значення за замовчуванням.", path, e)
        return fallback


def write_json(path: Path, data: Any) -> None:
    """Атомарний запис: спершу у тимчасовий файл поруч, тоді os.replace —
    так навіть раптовий SIGKILL/збій живлення не лишить файл напівзаписаним."""
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = path.with_suffix(path.suffix + f".tmp-{uuid.uuid4().hex[:8]}")
    tmp_path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    os.replace(tmp_path, path)


# --- Telegram Bot API (з ретраями) ------------------------------------------

def tg(method: str, payload: dict, *, retries: int = 3) -> dict:
    """POST до Bot API з експоненційним бекофом на мережеві збої.
    getUpdates навмисно НЕ ретраїться тут (він і так у зовнішньому циклі)."""
    delay = 1.0
    last_error: Optional[Exception] = None
    for attempt in range(1, retries + 1):
        try:
            res = requests.post(f"{API_BASE}/{method}", json=payload, timeout=POLL_TIMEOUT_SECONDS + 10)
            data = res.json()
        except (requests.RequestException, ValueError) as e:
            last_error = e
            if attempt < retries and method != "getUpdates":
                log.warning("Мережева помилка у %s (спроба %d/%d): %s — повтор через %.0fс", method, attempt, retries, e, delay)
                time.sleep(delay)
                delay *= 2
                continue
            log.error("Мережева помилка у %s: %s", method, e)
            return {"ok": False}

        if not data.get("ok"):
            # 429 Too Many Requests — Telegram сам каже, скільки почекати.
            if data.get("error_code") == 429:
                retry_after = data.get("parameters", {}).get("retry_after", int(delay))
                log.warning("Rate limit від Telegram у %s, чекаю %sс.", method, retry_after)
                time.sleep(retry_after + 0.5)
                if attempt < retries:
                    continue
            log.error("Telegram API помилка у %s: %s", method, data.get("description"))
        return data
    return {"ok": False, "description": str(last_error)}


def send_message(chat_id: int, text: str, **extra) -> dict:
    return tg("sendMessage", {"chat_id": chat_id, "text": text, "parse_mode": "HTML", **extra})


def is_admin_chat(chat_id: int) -> bool:
    return int(chat_id) in ADMIN_CHAT_IDS


def user_label(user_id: Optional[int], username: Optional[str], display_name: Optional[str]) -> str:
    handle = f"@{username}" if username else (display_name or "без імені")
    return f"{handle} (id {user_id})"


def kind_badge(kind: Optional[str]) -> str:
    if not kind:
        return "🚦 Транспорт"
    return f"{KIND_EMOJI.get(kind, '🚦')} {KIND_LABELS.get(kind, 'Транспорт')}"


def fmt_hours(hours: float) -> str:
    return f"{hours:g}"


DELAY_TAG_RE = re.compile(r"^#delay:([a-z_]+):([^\s#]+)#\s*")
SUPPORT_TAG_RE = re.compile(r"^#support#\s*")


# --- антиспам (rate limit) ---------------------------------------------------

def check_and_touch_rate_limit(rate_limits: dict, user_id: Optional[int], bucket: str, now: float) -> bool:
    """True, якщо користувачу МОЖНА виконати дію (не в кулдауні) — і одразу
    оновлює мітку часу. Окремий bucket на "delay" і "support", щоб одне не
    блокувало інше."""
    if user_id is None:
        return True
    key = f"{bucket}:{user_id}"
    last = rate_limits.get(key, 0)
    if now - last < USER_RATE_LIMIT_SECONDS:
        return False
    rate_limits[key] = now
    return True


def prune_rate_limits(rate_limits: dict, now: float) -> dict:
    cutoff = now - max(USER_RATE_LIMIT_SECONDS, 60) * 4
    return {k: v for k, v in rate_limits.items() if v >= cutoff}


def prune_pending_actions(pending_actions: dict, now: float) -> dict:
    cutoff = now - PENDING_ACTION_TTL_MINUTES * 60
    return {k: v for k, v in pending_actions.items() if v.get("ts", 0) >= cutoff}


# --- git ---------------------------------------------------------------------

def git_commit_and_push() -> None:
    if not AUTO_GIT_PUSH:
        return

    branch = os.getenv("GIT_BRANCH", "main")

    def run(*args: str, check: bool = False) -> subprocess.CompletedProcess:
        return subprocess.run(["git", *args], cwd=REPO_ROOT, check=check, capture_output=True, text=True)

    # Прибираємо незавершений rebase/merge, якщо лишився з попередньої
    # невдалої спроби в цьому ж процесі.
    run("rebase", "--abort")
    run("merge", "--abort")

    try:
        subprocess.run(["git", "config", "user.name", "kharkivgo-bot"], cwd=REPO_ROOT, check=False)
        subprocess.run(["git", "config", "user.email", "bot@kharkivgo.local"], cwd=REPO_ROOT, check=False)
        subprocess.run(
            ["git", "add", "frontend/data-runtime", "frontend/public/data/route-alerts.json"],
            cwd=REPO_ROOT,
            check=False,
        )
        diff = subprocess.run(["git", "diff", "--cached", "--quiet"], cwd=REPO_ROOT)
        if diff.returncode == 0:
            return  # нема змін

        subprocess.run(
            ["git", "commit", "-m", "chore: process telegram bot updates"],
            cwd=REPO_ROOT,
            check=False,
        )

        # Ці файли — лише РЕЗЕРВНА копія (Supabase тепер основне джерело
        # правди), тож замість rebase з можливими конфліктами просто
        # синхронізуємось із origin і накочуємо свій актуальний варіант
        # цих конкретних файлів поверх, без ручного злиття.
        for attempt in range(1, 4):
            result = subprocess.run(["git", "push"], cwd=REPO_ROOT, check=False, capture_output=True, text=True)
            if result.returncode == 0:
                log.info("Зміни закомічено й запушено в git.")
                return
            if attempt == 3:
                log.warning("git push завершився з помилкою після 3 спроб: %s", (result.stderr or "").strip()[:300])
                return
            run("fetch", "origin", branch)
            run("reset", "--mixed", f"origin/{branch}")
            subprocess.run(
                ["git", "add", "frontend/data-runtime", "frontend/public/data/route-alerts.json"],
                cwd=REPO_ROOT,
                check=False,
            )
            subprocess.run(
                ["git", "commit", "-m", "chore: process telegram bot updates"],
                cwd=REPO_ROOT,
                check=False,
            )
    except Exception as e:  # noqa: BLE001
        log.error("Не вдалося закомітити/запушити зміни: %s", e)
        run("rebase", "--abort")
        run("merge", "--abort")


# --- команди для setMyCommands (щоб з'явилось меню "/" у Telegram) ---------

def register_commands() -> None:
    tg("setMyCommands", {
        "commands": [
            {"command": "start", "description": "Почати / відкрити меню"},
            {"command": "help", "description": "Довідка"},
        ],
    })
    admin_commands = [
        {"command": "start", "description": "Почати / відкрити меню"},
        {"command": "help", "description": "Довідка"},
    ]
    for admin_id in ADMIN_CHAT_IDS:
        tg("setMyCommands", {"commands": admin_commands, "scope": {"type": "chat", "chat_id": admin_id}})


# --- основний цикл обробки ---------------------------------------------------

def process_once() -> None:
    offset_state = read_json(OFFSET_FILE, {"lastUpdateId": 0})
    delay_reports = read_json(DELAY_REPORTS_FILE, [])
    support_map = read_json(SUPPORT_MAP_FILE, [])
    pending_prompts = read_json(PENDING_PROMPTS_FILE, [])
    rate_limits = read_json(RATE_LIMIT_FILE, {})
    pending_actions = read_json(PENDING_ACTIONS_FILE, {})
    alerts = read_json(PUBLIC_ALERTS_PATH, {"items": []}).get("items", [])

    updates_res = tg(
        "getUpdates",
        {
            "offset": offset_state["lastUpdateId"] + 1,
            "timeout": POLL_TIMEOUT_SECONDS,
            "allowed_updates": ["message", "callback_query"],
        },
    )
    updates = updates_res.get("result", []) if updates_res.get("ok") else []
    if not updates:
        return

    now = time.time()
    changed = False
    delay_reports_before = len(delay_reports)

    for update in updates:
        offset_state["lastUpdateId"] = max(offset_state["lastUpdateId"], update["update_id"])
        changed = True

        if "callback_query" in update:
            handle_callback_query(update["callback_query"], alerts, pending_prompts, delay_reports, pending_actions, now)
            continue

        message = update.get("message")
        if not message:
            continue

        text = message.get("text")
        chat_id = message["chat"]["id"]
        chat_type = message["chat"]["type"]
        frm = message.get("from", {}) or {}
        admin = is_admin_chat(chat_id)

        if chat_type != "private":
            continue

        if text and text.strip() in ("/start", "/help"):
            pending_actions.pop(str(chat_id), None)
            if text.strip() == "/start":
                handle_start(chat_id, admin)
            else:
                handle_help(chat_id, admin)
            continue

        if not text:
            continue
        text = text.strip()

        # --- Кнопки постійного меню (мають пріоритет — завжди скидають
        # незавершений діалог, щоб користувач не застряг) --------------------
        if text == BTN_CANCEL:
            pending_actions.pop(str(chat_id), None)
            send_message(chat_id, "Скасовано. Оберіть дію на клавіатурі 👇", reply_markup=main_menu_keyboard(admin))
            continue

        if text == BTN_HELP:
            pending_actions.pop(str(chat_id), None)
            handle_help(chat_id, admin)
            continue

        if text == BTN_REPORT_DELAY:
            pending_actions[str(chat_id)] = {"action": "report_kind", "ts": now}
            send_message(
                chat_id,
                "Який вид транспорту затримується?",
                reply_markup=kind_inline_keyboard("rkind"),
            )
            continue

        if text == BTN_CHECK_ROUTE:
            pending_actions[str(chat_id)] = {"action": "check_route", "ts": now}
            send_message(
                chat_id,
                "Введіть номер маршруту, який хочете перевірити (наприклад <code>27</code>):",
                reply_markup=cancel_only_keyboard(),
            )
            continue

        if text == BTN_ACTIVE_ALERTS:
            pending_actions.pop(str(chat_id), None)
            handle_public_alerts_list(chat_id, alerts, now)
            continue

        if text == BTN_SUPPORT:
            pending_actions[str(chat_id)] = {"action": "support_text", "ts": now}
            send_message(
                chat_id,
                "Напишіть повідомлення одним текстом — я передам його адміністратору, і відповідь прийде сюди ж.",
                reply_markup=cancel_only_keyboard(),
            )
            continue

        if admin and text == BTN_ADMIN_ALERT:
            pending_actions[str(chat_id)] = {"action": "alert_kind", "ts": now}
            send_message(
                chat_id,
                "Оберіть вид транспорту, на який поширюється затримка:",
                reply_markup=kind_inline_keyboard("akind"),
            )
            continue

        if admin and text == BTN_ADMIN_ALERTS:
            pending_actions.pop(str(chat_id), None)
            handle_alerts_command(chat_id, alerts, now)
            continue

        if admin and text == BTN_ADMIN_STATS:
            pending_actions.pop(str(chat_id), None)
            handle_stats_command(chat_id, alerts, delay_reports, pending_prompts, now)
            continue

        # --- Продовження вже почато́го діалогу (введення тексту кроком) -----
        pending = pending_actions.get(str(chat_id))
        if pending and handle_pending_text_step(chat_id, frm, text, pending, pending_actions, alerts, delay_reports, rate_limits, support_map, admin, now):
            continue

        # Reply адміна на переслане звернення користувача
        if admin and message.get("reply_to_message"):
            mapping = next(
                (
                    m
                    for m in support_map
                    if m["chatId"] == chat_id and m["messageId"] == message["reply_to_message"]["message_id"]
                ),
                None,
            )
            if mapping:
                send_message(mapping["userId"], f"💬 <b>Відповідь від підтримки Kharkiv GO:</b>\n\n{escape_html(text)}")
                send_message(chat_id, "✅ Відповідь надіслано користувачу.", reply_to_message_id=message["message_id"])
            continue

        if admin:
            continue  # адмін пише щось інше — ігноруємо

        # Сумісність зі старими тегованими повідомленнями з Mini App
        delay_match = DELAY_TAG_RE.match(text)
        if delay_match:
            handle_delay_report(chat_id, frm, text, delay_match, delay_reports, rate_limits, now)
            continue
        if SUPPORT_TAG_RE.match(text):
            handle_support_message(chat_id, frm, text, support_map, rate_limits, now)
            continue

        # Невпізнаний текст — не мовчимо, підказуємо кнопки.
        send_message(
            chat_id,
            "Не зовсім зрозумів 🙂 Скористайтесь кнопками нижче — так найшвидше:",
            reply_markup=main_menu_keyboard(admin),
        )

    if not changed:
        return

    # --- поріг скарг -> запропонувати адміну оголосити затримку -------------
    window_start = now - DELAY_REPORT_WINDOW_MINUTES * 60
    by_route: dict[str, set] = {}
    for r in delay_reports:
        if r["createdAt"] < window_start:
            continue
        key = f"{r['routeNumber']}::{r['kind'] or '_'}"
        by_route.setdefault(key, set()).add(r["userId"])

    for key, user_set in by_route.items():
        route_number, kind_raw = key.split("::")
        kind = None if kind_raw == "_" else kind_raw
        if len(user_set) < DELAY_REPORT_THRESHOLD:
            continue

        has_active_alert = any(
            a["routeNumber"] == route_number and (a.get("kind") is None or a["kind"] == kind) and a["expiresAt"] > now
            for a in alerts
        )
        if has_active_alert:
            continue

        already_prompted = any(p["routeNumber"] == route_number and p["kind"] == kind for p in pending_prompts)
        if already_prompted:
            continue

        prompt_text = (
            f"⚠️ <b>Увага!</b> {len(user_set)} різних користувачів поскаржились на затримку маршруту "
            f"<b>{escape_html(route_number)}</b> ({kind_badge(kind)}) за останні {DELAY_REPORT_WINDOW_MINUTES} хв.\n\n"
            f"Опублікувати оголошення про затримку (орієнтовно ~15 хв) в застосунку?"
        )
        keyboard = {
            "inline_keyboard": [[
                {"text": "✅ Так, оголосити затримку", "callback_data": f"confirm_alert:{route_number}:{kind or '-'}"}
            ]]
        }
        for admin_id in ADMIN_CHAT_IDS:
            send_message(admin_id, prompt_text, reply_markup=keyboard)
        pending_prompts.append({"routeNumber": route_number, "kind": kind, "createdAt": now})
        log.info("Поріг скарг досягнуто: маршрут %s (%s), %d користувачів.", route_number, kind or "-", len(user_set))

    # --- Supabase: спершу лог нових скарг (до прибирання старих нижче) ------
    new_delay_reports = delay_reports[delay_reports_before:]
    if new_delay_reports and supabase_sync.insert_delay_reports(new_delay_reports):
        log.info("Supabase: додано %d нову(і) скаргу(и) на затримку.", len(new_delay_reports))

    # --- прибирання: старі скарги/мапи/протухлі оголошення/rate-limit'и -----
    delay_reports = [r for r in delay_reports if r["createdAt"] >= window_start - 3600]
    support_map = support_map[-500:]
    pending_prompts = [p for p in pending_prompts if now - p["createdAt"] < DELAY_REPORT_WINDOW_MINUTES * 60]
    alerts = [a for a in alerts if a["expiresAt"] > now - 86400]
    rate_limits = prune_rate_limits(rate_limits, now)
    pending_actions = prune_pending_actions(pending_actions, now)

    active_alerts = [a for a in alerts if a["expiresAt"] > now]
    if supabase_sync.replace_route_alerts(active_alerts):
        log.info("Supabase: route_alerts синхронізовано (%d активних).", len(active_alerts))

    write_json(OFFSET_FILE, offset_state)
    write_json(DELAY_REPORTS_FILE, delay_reports)
    write_json(SUPPORT_MAP_FILE, support_map)
    write_json(PENDING_PROMPTS_FILE, pending_prompts)
    write_json(RATE_LIMIT_FILE, rate_limits)
    write_json(PENDING_ACTIONS_FILE, pending_actions)
    write_json(PUBLIC_ALERTS_PATH, {"updatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "items": alerts})

    git_commit_and_push()


def escape_html(text: str) -> str:
    return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


# --- привітання / довідка -----------------------------------------------------

def handle_start(chat_id: int, is_admin: bool) -> None:
    text = (
        "👋 <b>Вітаємо у Kharkiv GO!</b>\n\n"
        "Я допоможу дізнатись про затримки громадського транспорту Харкова "
        "й швидко звʼязатись із підтримкою — усе кнопками, нічого набирати не треба.\n\n"
        "Оберіть дію на клавіатурі знизу 👇"
    )
    if is_admin:
        text += "\n\n🛠 У вас права адміністратора — доступні додаткові кнопки оголошень і статистики."
    text += f"\n\n🆔 Ваш chat_id: <code>{chat_id}</code>"
    send_message(chat_id, text, reply_markup=main_menu_keyboard(is_admin))


def handle_help(chat_id: int, is_admin: bool) -> None:
    text = (
        "ℹ️ <b>Як користуватись Kharkiv GO Bot</b>\n\n"
        f"• «{BTN_REPORT_DELAY}» — повідомити, що ваш маршрут затримується (вид → номер).\n"
        f"• «{BTN_CHECK_ROUTE}» — дізнатись, чи є вже підтверджена затримка на маршруті.\n"
        f"• «{BTN_ACTIVE_ALERTS}» — список усіх активних оголошень зараз.\n"
        f"• «{BTN_SUPPORT}» — написати в підтримку, адмін відповість прямо тут.\n"
    )
    if is_admin:
        text += (
            f"\n<b>Адмінські кнопки:</b>\n"
            f"• «{BTN_ADMIN_ALERT}» — оголосити затримку: вид → маршрут (або «усі») → орієнтовний час.\n"
            f"• «{BTN_ADMIN_ALERTS}» — активні оголошення, кожне скасовується в 1 тап.\n"
            f"• «{BTN_ADMIN_STATS}» — короткий дашборд бота.\n"
            f"• Reply на переслане звернення користувача — відповідь піде йому напряму.\n"
        )
    send_message(chat_id, text, reply_markup=main_menu_keyboard(is_admin))


# --- крокові діалоги (FSM за кнопками) ---------------------------------------

def handle_pending_text_step(
    chat_id: int,
    frm: dict,
    text: str,
    pending: dict,
    pending_actions: dict,
    alerts: list,
    delay_reports: list,
    rate_limits: dict,
    support_map: list,
    is_admin: bool,
    now: float,
) -> bool:
    """Обробляє текстове повідомлення як черговий крок незавершеного діалогу.
    Повертає True, якщо повідомлення було "спожите" як частина діалогу."""
    action = pending.get("action")

    if action == "check_route":
        pending_actions.pop(str(chat_id), None)
        route_number = text.strip()
        matches = [
            a for a in alerts
            if a["expiresAt"] > now and (
                str(a["routeNumber"]).strip().lower() == route_number.lower()
                or str(a["routeNumber"]).strip().lower() == "all"
            )
        ]
        if matches:
            lines = []
            for a in matches:
                lines.append(f"{kind_badge(a.get('kind'))} · {escape_html(a['message'])}")
            body = "\n\n".join(lines)
            send_message(
                chat_id,
                f"⚠️ <b>На маршруті {escape_html(route_number)} можлива затримка.</b>\n\n{body}",
                reply_markup=main_menu_keyboard(is_admin),
            )
        else:
            send_message(
                chat_id,
                f"✅ Активних оголошень про затримку на маршруті <b>{escape_html(route_number)}</b> зараз немає.",
                reply_markup=main_menu_keyboard(is_admin),
            )
        return True

    if action == "report_route":
        if not check_and_touch_rate_limit(rate_limits, frm.get("id"), "delay", now):
            pending_actions.pop(str(chat_id), None)
            send_message(chat_id, "⏳ Зачекайте трохи перед наступною скаргою — попередню вже надіслано.", reply_markup=main_menu_keyboard(is_admin))
            return True
        pending_actions.pop(str(chat_id), None)
        route_number = text.strip()
        kind = pending.get("kind")
        delay_reports.append(
            {
                "userId": frm.get("id"),
                "username": frm.get("username"),
                "kind": kind,
                "routeNumber": route_number,
                "comment": "",
                "createdAt": now,
            }
        )
        report_text = (
            f"🚨 <b>Скарга на затримку</b>\n"
            f"Маршрут: <b>{escape_html(route_number)}</b> ({kind_badge(kind)})\n"
            f"Від: {escape_html(user_label(frm.get('id'), frm.get('username'), frm.get('first_name')))}"
        )
        for admin_id in ADMIN_CHAT_IDS:
            send_message(admin_id, report_text)
        send_message(
            chat_id,
            "✅ Дякуємо! Скаргу на затримку передано адміністратору.",
            reply_markup=main_menu_keyboard(is_admin),
        )
        log.info("Скарга на затримку (кнопки): маршрут=%s kind=%s user=%s", route_number, kind, frm.get("id"))
        return True

    if action == "support_text":
        pending_actions.pop(str(chat_id), None)
        handle_support_message(chat_id, frm, f"#support# {text}", support_map, rate_limits, now)
        send_message(chat_id, "Оберіть наступну дію 👇", reply_markup=main_menu_keyboard(is_admin))
        return True

    if action == "alert_route" and is_admin:
        pending_actions[str(chat_id)] = {
            "action": "alert_preset",
            "kind": pending.get("kind"),
            "route": text.strip(),
            "ts": now,
        }
        send_preset_prompt(chat_id, text.strip(), pending.get("kind"))
        return True

    if action == "alert_custom_text" and is_admin:
        pending_actions.pop(str(chat_id), None)
        create_alert_and_notify(chat_id, pending.get("route"), pending.get("kind"), text.strip(), alerts, now)
        return True

    return False


def send_preset_prompt(chat_id: int, route_number: str, kind: Optional[str]) -> None:
    route_label = "усі маршрути" if route_number.lower() == "all" else f"маршрут {route_number}"
    rows = [
        [{"text": f"🕐 ~{m} хв", "callback_data": f"apreset:{m}"} for m in DELAY_PRESETS_MINUTES],
        [{"text": "✍️ Свій текст", "callback_data": "apreset:custom"}],
        [{"text": "❌ Скасувати", "callback_data": "flow_cancel"}],
    ]
    send_message(
        chat_id,
        f"Оголошуємо затримку для <b>{escape_html(route_label)}</b> ({kind_badge(kind)}).\n"
        f"Оберіть орієнтовний час затримки або введіть власний текст:",
        reply_markup={"inline_keyboard": rows},
    )


def create_alert_and_notify(chat_id: int, route_number: str, kind: Optional[str], alert_text: str, alerts: list, now: float) -> None:
    if not alert_text:
        send_message(chat_id, "Порожній текст оголошення — спробуйте ще раз.", reply_markup=main_menu_keyboard(True))
        return
    alert_id = int(now * 1000)
    alerts.append(
        {
            "id": alert_id,
            "kind": kind,
            "routeNumber": route_number,
            "message": alert_text,
            "createdAt": now,
            "expiresAt": now + DELAY_ALERT_DURATION_HOURS * 3600,
            "source": "manual",
        }
    )
    try:
        notify_delay_subscribers(route_number, kind, alert_text)
    except Exception:  # noqa: BLE001
        log.exception("notify_delay_subscribers впав — оголошення все одно опубліковано в застосунку.")
    send_message(
        chat_id,
        f"✅ Оголошення створено для маршруту <b>{escape_html(route_number)}</b> на {fmt_hours(DELAY_ALERT_DURATION_HOURS)} год.",
        reply_markup={"inline_keyboard": [[{"text": "🗑 Скасувати достроково", "callback_data": f"cancel_alert:{alert_id}"}]]},
    )
    send_message(chat_id, "Оберіть наступну дію 👇", reply_markup=main_menu_keyboard(True))
    log.info("Оголошення створено (кнопки): id=%s маршрут=%s kind=%s", alert_id, route_number, kind)


# --- обробники повідомлень ----------------------------------------------------

def handle_delay_report(
    chat_id: int,
    frm: dict,
    text: str,
    delay_match: "re.Match[str]",
    delay_reports: list,
    rate_limits: dict,
    now: float,
) -> None:
    if not check_and_touch_rate_limit(rate_limits, frm.get("id"), "delay", now):
        send_message(chat_id, "⏳ Зачекайте трохи перед наступною скаргою — попередню вже надіслано.")
        return

    kind_raw, route_number = delay_match.groups()
    kind = None if kind_raw == "_" else kind_raw
    comment = DELAY_TAG_RE.sub("", text).strip()

    delay_reports.append(
        {
            "userId": frm.get("id"),
            "username": frm.get("username"),
            "kind": kind,
            "routeNumber": route_number,
            "comment": comment,
            "createdAt": now,
        }
    )

    report_text = (
        f"🚨 <b>Скарга на затримку</b>\n"
        f"Маршрут: <b>{escape_html(route_number)}</b> ({kind_badge(kind)})\n"
        f"Від: {escape_html(user_label(frm.get('id'), frm.get('username'), frm.get('first_name')))}"
    )
    if comment:
        report_text += f"\n💬 {escape_html(comment)}"
    for admin_id in ADMIN_CHAT_IDS:
        send_message(admin_id, report_text)
    send_message(chat_id, "✅ Дякуємо! Скаргу на затримку передано адміністратору.")
    log.info("Скарга на затримку: маршрут=%s kind=%s user=%s", route_number, kind, frm.get("id"))


def handle_support_message(
    chat_id: int,
    frm: dict,
    text: str,
    support_map: list,
    rate_limits: dict,
    now: float,
) -> None:
    support_text = SUPPORT_TAG_RE.sub("", text).strip()
    if not support_text:
        return

    if not check_and_touch_rate_limit(rate_limits, frm.get("id"), "support", now):
        send_message(chat_id, "⏳ Ваше попереднє звернення вже в черзі — зачекайте відповіді, будь ласка.")
        return

    header = (
        f"💬 <b>Нове звернення в підтримку</b>\n"
        f"Від: {escape_html(user_label(frm.get('id'), frm.get('username'), frm.get('first_name')))}\n\n"
        f"{escape_html(support_text)}\n\n"
        f"— Щоб відповісти користувачу, зробіть Reply на це повідомлення."
    )
    for admin_id in ADMIN_CHAT_IDS:
        sent = send_message(admin_id, header)
        if sent.get("ok"):
            result = sent["result"]
            support_map.append(
                {"chatId": result["chat"]["id"], "messageId": result["message_id"], "userId": frm.get("id")}
            )
    send_message(chat_id, "✅ Дякуємо! Ваше повідомлення передано в підтримку. Відповімо тут же, в цьому чаті.")
    log.info("Звернення в підтримку від user=%s", frm.get("id"))


def handle_public_alerts_list(chat_id: int, alerts: list, now: float) -> None:
    active = [a for a in alerts if a["expiresAt"] > now]
    if not active:
        send_message(chat_id, "✅ Наразі активних оголошень про затримки немає.")
        return
    send_message(chat_id, f"📋 <b>Активні оголошення ({len(active)}):</b>")
    for a in sorted(active, key=lambda x: x["expiresAt"]):
        minutes_left = max(0, int((a["expiresAt"] - now) / 60))
        route_label = "усі маршрути" if str(a["routeNumber"]).lower() == "all" else f"маршрут {a['routeNumber']}"
        text = (
            f"{kind_badge(a.get('kind'))} · {escape_html(route_label)}\n"
            f"{escape_html(a['message'])}\n"
            f"⏱ Ще ~{minutes_left} хв"
        )
        send_message(chat_id, text)


def handle_alerts_command(chat_id: int, alerts: list, now: float) -> None:
    active = [a for a in alerts if a["expiresAt"] > now]
    if not active:
        send_message(chat_id, "Наразі активних оголошень немає. ✅")
        return

    send_message(chat_id, f"📋 <b>Активні оголошення ({len(active)}):</b>")
    for a in sorted(active, key=lambda x: x["expiresAt"]):
        minutes_left = max(0, int((a["expiresAt"] - now) / 60))
        text = (
            f"{kind_badge(a.get('kind'))} · маршрут <b>{escape_html(str(a['routeNumber']))}</b>\n"
            f"{escape_html(a['message'])}\n"
            f"⏱ Ще ~{minutes_left} хв · джерело: {'авто' if a.get('source') == 'auto' else 'вручну'}"
        )
        send_message(
            chat_id,
            text,
            reply_markup={"inline_keyboard": [[{"text": "🗑 Скасувати", "callback_data": f"cancel_alert:{a['id']}"}]]},
        )


def handle_stats_command(chat_id: int, alerts: list, delay_reports: list, pending_prompts: list, now: float) -> None:
    active_alerts = [a for a in alerts if a["expiresAt"] > now]
    window_start = now - DELAY_REPORT_WINDOW_MINUTES * 60
    recent_reports = [r for r in delay_reports if r["createdAt"] >= window_start]
    unique_users = {r["userId"] for r in recent_reports}

    by_route: dict[str, int] = {}
    for r in recent_reports:
        key = f"{r['routeNumber']} ({KIND_LABELS.get(r['kind'], '—')})"
        by_route[key] = by_route.get(key, 0) + 1
    top_routes = sorted(by_route.items(), key=lambda kv: -kv[1])[:5]
    top_lines = "\n".join(f"  • {route}: {count}" for route, count in top_routes) or "  —"

    text = (
        "📊 <b>Статистика бота</b>\n\n"
        f"🟢 Активних оголошень: <b>{len(active_alerts)}</b>\n"
        f"📨 Скарг за останні {DELAY_REPORT_WINDOW_MINUTES} хв: <b>{len(recent_reports)}</b> "
        f"від {len(unique_users)} унікальних користувачів\n"
        f"⏳ У черзі на підтвердження адміном: <b>{len(pending_prompts)}</b>\n\n"
        f"<b>Топ маршрутів за скаргами:</b>\n{top_lines}"
    )
    send_message(chat_id, text)


# --- обробка inline-кнопок (callback_query) ----------------------------------

def handle_callback_query(cq: dict, alerts: list, pending_prompts: list, delay_reports: list, pending_actions: dict, now: float) -> None:
    chat_id = cq["message"]["chat"]["id"]
    data = cq.get("data", "")
    admin = is_admin_chat(chat_id)

    if data == "flow_cancel":
        pending_actions.pop(str(chat_id), None)
        tg("answerCallbackQuery", {"callback_query_id": cq["id"], "text": "Скасовано"})
        tg(
            "editMessageText",
            {
                "chat_id": chat_id,
                "message_id": cq["message"]["message_id"],
                "text": f"{cq['message'].get('text', '')}\n\n❌ <i>Скасовано.</i>",
                "parse_mode": "HTML",
            },
        )
        send_message(chat_id, "Оберіть дію на клавіатурі 👇", reply_markup=main_menu_keyboard(admin))
        return

    # --- діалог "Повідомити про затримку" (будь-який користувач) -----------
    if data.startswith("rkind:"):
        kind = data.split(":", 1)[1]
        kind = None if kind == "-" else kind
        pending_actions[str(chat_id)] = {"action": "report_route", "kind": kind, "ts": now}
        tg("answerCallbackQuery", {"callback_query_id": cq["id"]})
        send_message(
            chat_id,
            "Введіть номер маршруту (наприклад <code>27</code>):",
            reply_markup=cancel_only_keyboard(),
        )
        return

    # --- діалог "Оголосити затримку" (тільки адмін) --------------------------
    if data.startswith("akind:") and admin:
        kind = data.split(":", 1)[1]
        kind = None if kind == "-" else kind
        pending_actions[str(chat_id)] = {"action": "alert_route", "kind": kind, "ts": now}
        tg("answerCallbackQuery", {"callback_query_id": cq["id"]})
        send_message(
            chat_id,
            "Введіть номер маршруту, або натисніть «Усі маршрути»:",
            reply_markup={
                "inline_keyboard": [
                    [{"text": "🌐 Усі маршрути цього виду", "callback_data": "aroute_all"}],
                    [{"text": "❌ Скасувати", "callback_data": "flow_cancel"}],
                ]
            },
        )
        return

    if data == "aroute_all" and admin:
        pending = pending_actions.get(str(chat_id), {})
        kind = pending.get("kind")
        pending_actions[str(chat_id)] = {"action": "alert_preset", "kind": kind, "route": "all", "ts": now}
        tg("answerCallbackQuery", {"callback_query_id": cq["id"]})
        send_preset_prompt(chat_id, "all", kind)
        return

    if data.startswith("apreset:") and admin:
        pending = pending_actions.get(str(chat_id), {})
        route_number = pending.get("route")
        kind = pending.get("kind")
        choice = data.split(":", 1)[1]
        tg("answerCallbackQuery", {"callback_query_id": cq["id"]})
        if choice == "custom":
            pending_actions[str(chat_id)] = {"action": "alert_custom_text", "kind": kind, "route": route_number, "ts": now}
            send_message(chat_id, "Введіть текст оголошення:", reply_markup=cancel_only_keyboard())
            return
        pending_actions.pop(str(chat_id), None)
        minutes = choice
        route_label = "усі маршрути" if str(route_number).lower() == "all" else f"маршрут {route_number}"
        alert_text = f"Можлива затримка руху ({route_label}), орієнтовно ~{minutes} хв."
        create_alert_and_notify(chat_id, route_number, kind, alert_text, alerts, now)
        return

    # --- решта callback-ів доступні лише адмінам ----------------------------
    if not admin:
        tg("answerCallbackQuery", {"callback_query_id": cq["id"], "text": "Недостатньо прав", "show_alert": True})
        return

    if data.startswith("cancel_alert:"):
        alert_id_raw = data.split(":", 1)[1]
        try:
            alert_id = int(alert_id_raw)
        except ValueError:
            alert_id = None
        before = len(alerts)
        alerts[:] = [a for a in alerts if a.get("id") != alert_id]
        removed = len(alerts) != before
        tg(
            "editMessageText",
            {
                "chat_id": chat_id,
                "message_id": cq["message"]["message_id"],
                "text": f"{cq['message'].get('text', '')}\n\n🗑 <b>Скасовано.</b>" if removed else cq["message"].get("text", ""),
                "parse_mode": "HTML",
            },
        )
        tg(
            "answerCallbackQuery",
            {"callback_query_id": cq["id"], "text": "Оголошення скасовано" if removed else "Вже неактивне"},
        )
        return

    parts = data.split(":")
    if len(parts) < 3 or parts[0] != "confirm_alert":
        return
    _, route_number, kind_raw = parts
    kind = None if kind_raw == "-" else kind_raw

    matching = [
        r for r in reversed(delay_reports) if r["routeNumber"] == route_number and (kind is None or r["kind"] == kind)
    ]
    last_comment = matching[0]["comment"] if matching and matching[0].get("comment") else ""

    text = f"Можлива затримка руху маршруту {route_number}, орієнтовно ~15 хв. Повідомляють кілька пасажирів."
    if last_comment:
        text += f" Коментар: {last_comment[:200]}"

    new_alert_id = int(now * 1000)
    alerts.append(
        {
            "id": new_alert_id,
            "kind": kind,
            "routeNumber": route_number,
            "message": text,
            "createdAt": now,
            "expiresAt": now + DELAY_ALERT_DURATION_HOURS * 3600,
            "source": "auto",
        }
    )
    pending_prompts[:] = [p for p in pending_prompts if not (p["routeNumber"] == route_number and p["kind"] == kind)]
    try:
        notify_delay_subscribers(route_number, kind, text)
    except Exception:  # noqa: BLE001
        log.exception("notify_delay_subscribers впав — оголошення все одно опубліковано в застосунку.")

    tg(
        "editMessageText",
        {
            "chat_id": chat_id,
            "message_id": cq["message"]["message_id"],
            "text": (
                f"{cq['message'].get('text', '')}\n\n"
                f"✅ <b>Підтверджено.</b> Оголошення активне {fmt_hours(DELAY_ALERT_DURATION_HOURS)} год."
            ),
            "parse_mode": "HTML",
            "reply_markup": {
                "inline_keyboard": [[{"text": "🗑 Скасувати достроково", "callback_data": f"cancel_alert:{new_alert_id}"}]]
            },
        },
    )
    tg("answerCallbackQuery", {"callback_query_id": cq["id"], "text": "Оголошення опубліковано в застосунку"})
    log.info("Оголошення затримки створено: id=%s маршрут=%s", new_alert_id, route_number)


# --- запуск / graceful shutdown ---------------------------------------------

_shutdown_requested = False


def _handle_shutdown_signal(signum, _frame) -> None:
    global _shutdown_requested
    log.info("Отримано сигнал %s — завершую поточний цикл і виходжу.", signal.Signals(signum).name)
    _shutdown_requested = True


def main() -> None:
    if not BOT_TOKEN:
        raise SystemExit("BOT_TOKEN не задано (.env) — нічого робити.")
    if not ADMIN_CHAT_IDS:
        log.warning("ADMIN_CHAT_IDS не задано — нікому надсилати сповіщення.")

    signal.signal(signal.SIGINT, _handle_shutdown_signal)
    signal.signal(signal.SIGTERM, _handle_shutdown_signal)

    log.info("Запуск. REPO_ROOT=%s", REPO_ROOT)
    log.info("Дані: %s, оголошення: %s", RUNTIME_DIR, PUBLIC_ALERTS_PATH)

    register_commands()

    while not _shutdown_requested:
        try:
            process_once()
        except Exception:  # noqa: BLE001
            log.exception("Помилка в основному циклі — продовжую через 5с.")
            time.sleep(5)

    log.info("Бот зупинено.")


if __name__ == "__main__":
    main()
