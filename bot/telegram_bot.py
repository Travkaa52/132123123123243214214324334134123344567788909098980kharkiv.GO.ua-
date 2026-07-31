#!/usr/bin/env python3
"""
bot/telegram_bot.py
------------------------------------------------------------------------------
Python-версія бота підтримки/затримок — ОПЦІЙНА альтернатива
`.github/workflows/telegram-bot.yml` (`frontend/scripts/process-telegram-bot.mjs`).

За замовчуванням екосистема не потребує жодного постійного сервера: GitHub
Actions прокидається раз на ~5 хв, забирає нові повідомлення й комітить
`frontend/public/data/route-alerts.json` назад у репозиторій. Це безкоштовно,
але з затримкою в кілька хвилин.

Цей скрипт — те саме, тільки постійним процесом (long polling, timeout=30с),
для тих, у кого є VPS / домашній сервер / інший завжди-увімкнений
комп'ютер і хочеться миттєвих відповідей адміна користувачу та миттєвої
появи банера про затримку. Працює з ТИМИ Ж файлами даних, що й Actions-версія
(`frontend/data-runtime/*.json`, `frontend/public/data/route-alerts.json`),
тож можна вільно перемикатись між підходами або тримати цей скрипт
запущеним і одночасно лишити workflow як запасний варіант (concurrency
конфліктів нема — обидва просто читають/пишуть ті самі файли; вимкніть один
із двох, якщо не хочете подвійної обробки одних і тих самих апдейтів —
хоча Telegram getUpdates з offset все одно унеможливлює дублікати).

Щоб зміни (нове оголошення про затримку) реально долетіли до GitHub Pages,
скрипт після кожної обробленої пачки апдейтів комітить і пушить зміни в git
(як і workflow) — для цього репозиторій, у якому лежить цей файл, має бути
git-репозиторієм з налаштованим origin і правами на push (напр. персональний
токен у remote URL, або ssh-ключ; або запустіть із SSH_AUTH_SOCK у оточенні).
Якщо це не потрібно (наприклад, самі коммітите вручну) — вимкніть це
змінною AUTO_GIT_PUSH=false.

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
import os
import re
import subprocess
import time
from pathlib import Path
from typing import Optional

import requests
from dotenv import load_dotenv

load_dotenv()

BOT_TOKEN = os.getenv("BOT_TOKEN", "")
ADMIN_CHAT_IDS = [int(x) for x in os.getenv("ADMIN_CHAT_IDS", "").replace(" ", "").split(",") if x]
DELAY_REPORT_THRESHOLD = int(os.getenv("DELAY_REPORT_THRESHOLD", "5"))
DELAY_REPORT_WINDOW_MINUTES = int(os.getenv("DELAY_REPORT_WINDOW_MINUTES", "60"))
DELAY_ALERT_DURATION_HOURS = float(os.getenv("DELAY_ALERT_DURATION_HOURS", "2"))
POLL_TIMEOUT_SECONDS = int(os.getenv("POLL_TIMEOUT_SECONDS", "30"))
AUTO_GIT_PUSH = os.getenv("AUTO_GIT_PUSH", "true").lower() not in ("false", "0", "no")

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

KIND_LABELS = {
    "bus": "Автобус",
    "trolleybus": "Тролейбус",
    "tram": "Трамвай",
    "metro": "Метро",
}

API_BASE = f"https://api.telegram.org/bot{BOT_TOKEN}"


# --- маленькі хелпери роботи з JSON-файлами стану ---------------------------

def read_json(path: Path, fallback):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        return fallback


def write_json(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


# --- Telegram Bot API ---------------------------------------------------

def tg(method: str, payload: dict) -> dict:
    try:
        res = requests.post(f"{API_BASE}/{method}", json=payload, timeout=POLL_TIMEOUT_SECONDS + 10)
        data = res.json()
    except requests.RequestException as e:
        print(f"[bot] Мережева помилка у {method}: {e}")
        return {"ok": False}
    if not data.get("ok"):
        print(f"[bot] Telegram API помилка у {method}: {data.get('description')}")
    return data


def send_message(chat_id: int, text: str, **extra) -> dict:
    return tg("sendMessage", {"chat_id": chat_id, "text": text, **extra})


def is_admin_chat(chat_id: int) -> bool:
    return int(chat_id) in ADMIN_CHAT_IDS


def user_label(user_id: int, username: Optional[str], display_name: Optional[str]) -> str:
    handle = f"@{username}" if username else (display_name or "без імені")
    return f"{handle} (id {user_id})"


DELAY_TAG_RE = re.compile(r"^#delay:([a-z_]+):([^\s#]+)#\s*")
SUPPORT_TAG_RE = re.compile(r"^#support#\s*")


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
        diff = subprocess.run(
            ["git", "diff", "--cached", "--quiet"], cwd=REPO_ROOT
        )
        if diff.returncode == 0:
            return  # нема змін
        subprocess.run(
            ["git", "commit", "-m", "chore: process telegram bot updates [skip ci]"],
            cwd=REPO_ROOT,
            check=False,
        )
        subprocess.run(["git", "push"], cwd=REPO_ROOT, check=False)
    except Exception as e:  # noqa: BLE001
        print(f"[bot] Не вдалося закомітити/запушити зміни: {e}")


def process_once() -> None:
    offset_state = read_json(OFFSET_FILE, {"lastUpdateId": 0})
    delay_reports = read_json(DELAY_REPORTS_FILE, [])
    support_map = read_json(SUPPORT_MAP_FILE, [])
    pending_prompts = read_json(PENDING_PROMPTS_FILE, [])
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

    for update in updates:
        offset_state["lastUpdateId"] = max(offset_state["lastUpdateId"], update["update_id"])

        if "callback_query" in update:
            handle_callback_query(update["callback_query"], alerts, pending_prompts, delay_reports, now)
            continue

        message = update.get("message")
        if not message:
            continue

        text = message.get("text")
        chat_id = message["chat"]["id"]
        chat_type = message["chat"]["type"]

        if text and text.startswith("/start") and chat_type == "private":
            send_message(
                chat_id,
                "👋 Вітаємо в Kharkiv GO!\n\n"
                "Повідомлення, надіслані сюди, автоматично йдуть у підтримку — ми відповімо прямо в цьому чаті.\n\n"
                f"Ваш chat_id (для налаштування адмінів): {chat_id}",
            )
            continue

        if text and text.startswith("/alert") and is_admin_chat(chat_id):
            handle_alert_command(message, alerts, now)
            continue

        if not text:
            continue

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
                send_message(mapping["userId"], f"💬 Відповідь від підтримки Kharkiv GO:\n\n{text}")
                send_message(chat_id, "✅ Відповідь надіслано користувачу.", reply_to_message_id=message["message_id"])
            continue

        if is_admin_chat(chat_id):
            continue
        if chat_type != "private":
            continue

        frm = message.get("from", {})
        delay_match = DELAY_TAG_RE.match(text)

        if delay_match:
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

            kind_label = KIND_LABELS.get(kind, "Транспорт")
            report_text = (
                f"🚨 Скарга на затримку\nМаршрут: {route_number} ({kind_label})\n"
                f"Від: {user_label(frm.get('id'), frm.get('username'), frm.get('first_name'))}"
            )
            if comment:
                report_text += f"\nКоментар: {comment}"
            for admin_id in ADMIN_CHAT_IDS:
                send_message(admin_id, report_text)
            send_message(chat_id, "✅ Дякуємо! Скаргу на затримку передано адміністратору.")
            continue

        support_text = SUPPORT_TAG_RE.sub("", text).strip()
        if not support_text:
            continue

        header = (
            f"💬 Нове звернення в підтримку\n"
            f"Від: {user_label(frm.get('id'), frm.get('username'), frm.get('first_name'))}\n\n{support_text}\n\n"
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

        kind_label = KIND_LABELS.get(kind, "Транспорт")
        prompt_text = (
            f"⚠️ Увага! {len(user_set)} різних користувачів поскаржились на затримку маршруту "
            f"{route_number} ({kind_label}) за останні {DELAY_REPORT_WINDOW_MINUTES} хв.\n\n"
            f"Опублікувати оголошення про затримку в застосунку?"
        )
        keyboard = {
            "inline_keyboard": [
                [{"text": "✅ Так, оголосити затримку", "callback_data": f"confirm_alert:{route_number}:{kind or '-'}"}]
            ]
        }
        for admin_id in ADMIN_CHAT_IDS:
            send_message(admin_id, prompt_text, reply_markup=keyboard)
        pending_prompts.append({"routeNumber": route_number, "kind": kind, "createdAt": now})

    # --- прибирання: старі скарги/мапи/протухлі оголошення -------------------
    delay_reports = [r for r in delay_reports if r["createdAt"] >= window_start - 3600]
    support_map = support_map[-500:]
    pending_prompts = [p for p in pending_prompts if now - p["createdAt"] < DELAY_REPORT_WINDOW_MINUTES * 60]
    alerts = [a for a in alerts if a["expiresAt"] > now - 86400]

    write_json(OFFSET_FILE, offset_state)
    write_json(DELAY_REPORTS_FILE, delay_reports)
    write_json(SUPPORT_MAP_FILE, support_map)
    write_json(PENDING_PROMPTS_FILE, pending_prompts)
    write_json(PUBLIC_ALERTS_PATH, {"updatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "items": alerts})

    git_commit_and_push()


def handle_callback_query(cq: dict, alerts: list, pending_prompts: list, delay_reports: list, now: float) -> None:
    chat_id = cq["message"]["chat"]["id"]
    if not is_admin_chat(chat_id):
        tg("answerCallbackQuery", {"callback_query_id": cq["id"], "text": "Недостатньо прав", "show_alert": True})
        return

    data = cq.get("data", "")
    parts = data.split(":")
    if len(parts) < 3:
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

    alerts.append(
        {
            "id": int(now * 1000),
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
            "text": f"{cq['message'].get('text', '')}\n\n✅ Підтверджено. Оголошення активне {DELAY_ALERT_DURATION_HOURS:g} год.",
        },
    )
    tg("answerCallbackQuery", {"callback_query_id": cq["id"], "text": "Оголошення опубліковано в застосунку"})


def handle_alert_command(message: dict, alerts: list, now: float) -> None:
    chat_id = message["chat"]["id"]
    parts = message["text"].split()
    if len(parts) < 3:
        send_message(chat_id, "Формат: /alert <номер_маршруту> [вид: bus/tram/trolleybus/metro] <текст оголошення>")
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

    alerts.append(
        {
            "id": int(now * 1000),
            "kind": kind,
            "routeNumber": route_number,
            "message": alert_text,
            "createdAt": now,
            "expiresAt": now + DELAY_ALERT_DURATION_HOURS * 3600,
            "source": "manual",
        }
    )
    send_message(chat_id, f"✅ Оголошення створено для маршруту {route_number} на {DELAY_ALERT_DURATION_HOURS:g} год.")


def main() -> None:
    if not BOT_TOKEN:
        raise SystemExit("BOT_TOKEN не задано (.env) — нічого робити.")
    if not ADMIN_CHAT_IDS:
        print("[bot] УВАГА: ADMIN_CHAT_IDS не задано — нікому надсилати сповіщення.")

    print(f"[bot] Запуск. REPO_ROOT={REPO_ROOT}")
    print(f"[bot] Дані: {RUNTIME_DIR}, оголошення: {PUBLIC_ALERTS_PATH}")

    while True:
        try:
            process_once()
        except Exception as e:  # noqa: BLE001
            print(f"[bot] Помилка в основному циклі: {e}")
            time.sleep(5)


if __name__ == "__main__":
    main()
