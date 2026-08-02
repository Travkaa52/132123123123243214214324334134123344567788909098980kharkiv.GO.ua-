#!/usr/bin/env python3
"""
bot/telegram_bot.py
------------------------------------------------------------------------------
Python-версія бота підтримки/затримок Kharkiv GO — ОПЦІЙНА альтернатива
`.github/workflows/telegram-bot.yml` (`frontend/scripts/process-telegram-bot.mjs`),
для тих, у кого є VPS / домашній сервер і хочеться миттєвих (не раз на ~3 год)
відповідей адміна та миттєвої появи банера про затримку.

Що вміє:
    Користувачі (приватний чат із ботом):
        /start          — привітання + показує ваш chat_id
        /help           — коротка довідка
        будь-який текст — йде в підтримку, адмін відповідає Reply
        (кнопки в Mini App шлють приховано-тегований текст "#delay:..#" —
         бот розпізнає це як структуровану скаргу на затримку)

    Адміни (ADMIN_CHAT_IDS):
        /alert <номер> [вид] <текст>  — вручну оголосити затримку
        /alerts                        — список активних оголошень + кнопки скасування
        /stats                         — короткий дашборд (скарги, оголошення, черга)
        Reply на переслане звернення   — відповідь іде користувачу
        Inline-кнопка під авто-запитом — підтвердити оголошення в 1 тап

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

API_BASE = f"https://api.telegram.org/bot{BOT_TOKEN}"

logging.basicConfig(
    level=getattr(logging, LOG_LEVEL, logging.INFO),
    format="%(asctime)s %(levelname)-7s %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger("kharkivgo-bot")


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


# --- git ---------------------------------------------------------------------

def git_commit_and_push() -> None:
    if not AUTO_GIT_PUSH:
        return
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
            ["git", "commit", "-m", "chore: process telegram bot updates [skip ci]"],
            cwd=REPO_ROOT,
            check=False,
        )
        result = subprocess.run(["git", "push"], cwd=REPO_ROOT, check=False, capture_output=True, text=True)
        if result.returncode != 0:
            log.warning("git push завершився з помилкою: %s", (result.stderr or "").strip()[:300])
        else:
            log.info("Зміни закомічено й запушено в git.")
    except Exception as e:  # noqa: BLE001
        log.error("Не вдалося закомітити/запушити зміни: %s", e)


# --- команди для setMyCommands (щоб з'явилось меню "/" у Telegram) ---------

def register_commands() -> None:
    tg("setMyCommands", {
        "commands": [
            {"command": "start", "description": "Почати / показати мій chat_id"},
            {"command": "help", "description": "Довідка"},
        ],
    })
    admin_commands = [
        {"command": "alert", "description": "Оголосити затримку вручну"},
        {"command": "alerts", "description": "Активні оголошення (зі скасуванням)"},
        {"command": "stats", "description": "Короткий дашборд бота"},
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

    for update in updates:
        offset_state["lastUpdateId"] = max(offset_state["lastUpdateId"], update["update_id"])
        changed = True

        if "callback_query" in update:
            handle_callback_query(update["callback_query"], alerts, pending_prompts, delay_reports, now)
            continue

        message = update.get("message")
        if not message:
            continue

        text = message.get("text")
        chat_id = message["chat"]["id"]
        chat_type = message["chat"]["type"]
        frm = message.get("from", {}) or {}

        if text and text.startswith("/start") and chat_type == "private":
            handle_start(chat_id)
            continue

        if text and text.startswith("/help"):
            handle_help(chat_id, is_admin_chat(chat_id))
            continue

        if text and text.startswith("/alert") and is_admin_chat(chat_id) and not text.startswith("/alerts"):
            handle_alert_command(message, alerts, now)
            continue

        if text and text.startswith("/alerts") and is_admin_chat(chat_id):
            handle_alerts_command(chat_id, alerts, now)
            continue

        if text and text.startswith("/stats") and is_admin_chat(chat_id):
            handle_stats_command(chat_id, alerts, delay_reports, pending_prompts, now)
            continue

        if not text:
            continue

        # Reply адміна на переслане звернення користувача
        if is_admin_chat(chat_id) and message.get("reply_to_message"):
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

        if is_admin_chat(chat_id):
            continue  # адмін пише щось інше — ігноруємо
        if chat_type != "private":
            continue

        delay_match = DELAY_TAG_RE.match(text)

        if delay_match:
            handle_delay_report(chat_id, frm, text, delay_match, delay_reports, rate_limits, now)
            continue

        handle_support_message(chat_id, frm, text, support_map, rate_limits, now)

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
            f"Опублікувати оголошення про затримку в застосунку?"
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

    # --- прибирання: старі скарги/мапи/протухлі оголошення/rate-limit'и -----
    delay_reports = [r for r in delay_reports if r["createdAt"] >= window_start - 3600]
    support_map = support_map[-500:]
    pending_prompts = [p for p in pending_prompts if now - p["createdAt"] < DELAY_REPORT_WINDOW_MINUTES * 60]
    alerts = [a for a in alerts if a["expiresAt"] > now - 86400]
    rate_limits = prune_rate_limits(rate_limits, now)

    write_json(OFFSET_FILE, offset_state)
    write_json(DELAY_REPORTS_FILE, delay_reports)
    write_json(SUPPORT_MAP_FILE, support_map)
    write_json(PENDING_PROMPTS_FILE, pending_prompts)
    write_json(RATE_LIMIT_FILE, rate_limits)
    write_json(PUBLIC_ALERTS_PATH, {"updatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "items": alerts})

    git_commit_and_push()


def escape_html(text: str) -> str:
    return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


# --- обробники повідомлень ----------------------------------------------------

def handle_start(chat_id: int) -> None:
    send_message(
        chat_id,
        "👋 <b>Вітаємо в Kharkiv GO!</b>\n\n"
        "Повідомлення, надіслані сюди, автоматично йдуть у підтримку — ми відповімо прямо в цьому чаті.\n\n"
        f"🆔 Ваш chat_id (для налаштування адмінів): <code>{chat_id}</code>",
    )


def handle_help(chat_id: int, is_admin: bool) -> None:
    text = (
        "ℹ️ <b>Довідка Kharkiv GO Bot</b>\n\n"
        "• Просто напишіть сюди — звернення піде в підтримку, відповімо в цьому ж чаті.\n"
        "• Кнопка «⚠️ Затримка» в застосунку сама формує повідомлення-скаргу.\n"
    )
    if is_admin:
        text += (
            "\n<b>Адмінські команди:</b>\n"
            "/alert &lt;номер&gt; [bus|tram|trolleybus|metro] &lt;текст&gt; — оголосити затримку вручну\n"
            "/alerts — активні оголошення зі скасуванням в 1 тап\n"
            "/stats — короткий дашборд\n"
            "Reply на переслане звернення користувача — відповідь піде йому напряму.\n"
        )
    send_message(chat_id, text)


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


def handle_callback_query(cq: dict, alerts: list, pending_prompts: list, delay_reports: list, now: float) -> None:
    chat_id = cq["message"]["chat"]["id"]
    if not is_admin_chat(chat_id):
        tg("answerCallbackQuery", {"callback_query_id": cq["id"], "text": "Недостатньо прав", "show_alert": True})
        return

    data = cq.get("data", "")

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

    text = f"Можлива затримка руху маршруту {route_number}. Повідомляють кілька пасажирів."
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


def handle_alert_command(message: dict, alerts: list, now: float) -> None:
    chat_id = message["chat"]["id"]
    parts = message["text"].split()
    if len(parts) < 3:
        send_message(chat_id, "Формат: <code>/alert &lt;номер_маршруту&gt; [вид: bus/tram/trolleybus/metro] &lt;текст&gt;</code>")
        return

    route_number = parts[1]
    kind = None
    text_start_idx = 2
    if parts[2].lower() in ("bus", "tram", "trolleybus", "metro"):
        kind = parts[2].lower()
        text_start_idx = 3

    alert_text = " ".join(parts[text_start_idx:]).strip()
    if not alert_text:
        send_message(chat_id, "Не вистачає тексту оголошення.")
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
    send_message(
        chat_id,
        f"✅ Оголошення створено для маршруту <b>{escape_html(route_number)}</b> на {fmt_hours(DELAY_ALERT_DURATION_HOURS)} год.",
        reply_markup={"inline_keyboard": [[{"text": "🗑 Скасувати достроково", "callback_data": f"cancel_alert:{alert_id}"}]]},
    )


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
