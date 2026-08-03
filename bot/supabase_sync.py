"""
bot/supabase_sync.py
------------------------------------------------------------------------------
Тонкий шар над Supabase REST (PostgREST) для двох таблиць:
    route_alerts  — публічні активні оголошення (їх читає застосунок)
    delay_reports — сирі скарги користувачів (лог подій)

Supabase тут ОСНОВНЕ джерело правди, локальні JSON-файли (data-runtime/,
public/data/route-alerts.json) лишаються як РЕЗЕРВНА копія — пишуться в
telegram_bot.py як і раніше, незалежно від того, чи вдався запит до
Supabase. Якщо SUPABASE_URL/SUPABASE_SERVICE_KEY не задані або якийсь
запит впав — усі функції нижче тихо повертають False/None і бот працює
далі виключно на JSON, як до інтеграції.

Використовується service_role ключ (не anon!) — він обходить RLS, тож
пише в обидві таблиці без обмежень. НІКОЛИ не комітьте цей ключ у git і
не кладіть у фронтенд — тільки в .env бота / секрети Actions.
"""
from __future__ import annotations

import logging
import os
import re
from typing import Any, Optional

import requests

log = logging.getLogger("kharkivgo-bot.supabase")

SUPABASE_URL = os.getenv("SUPABASE_URL", "").strip().rstrip("/")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "").strip()

ENABLED = bool(SUPABASE_URL and SUPABASE_SERVICE_KEY)

_HEADERS = {
    "apikey": SUPABASE_SERVICE_KEY,
    "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
    "Content-Type": "application/json",
}

if not ENABLED:
    log.info("SUPABASE_URL/SUPABASE_SERVICE_KEY не задано — синхронізація вимкнена, працюю тільки з JSON.")
elif re.search(r"/(rest|auth|storage)(/|$)", SUPABASE_URL, re.IGNORECASE):
    log.warning(
        "SUPABASE_URL схоже містить зайвий шлях (%s) — має бути лише базовий домен проєкту, "
        "напр. https://xxxx.supabase.co, без /rest/v1 чи іншого хвоста.",
        SUPABASE_URL,
    )


def _rest(method: str, table: str, *, params: Optional[dict] = None, json_body: Any = None, prefer: str = "") -> Optional[Any]:
    if not ENABLED:
        return None
    headers = dict(_HEADERS)
    if prefer:
        headers["Prefer"] = prefer
    try:
        res = requests.request(
            method,
            f"{SUPABASE_URL}/rest/v1/{table}",
            headers=headers,
            params=params,
            json=json_body,
            timeout=15,
        )
        if res.status_code >= 400:
            log.warning("Supabase %s %s -> %s: %s", method, res.url, res.status_code, res.text[:300])
            return None
        if not res.text:
            return []
        return res.json()
    except requests.RequestException as e:
        log.warning("Supabase %s %s мережева помилка: %s", method, table, e)
        return None


def replace_route_alerts(alerts: list[dict]) -> bool:
    """Повністю синхронізує таблицю route_alerts зі списком активних
    оголошень (той самий список, що йде у route-alerts.json). Проста
    стратегія "видалити все й вставити поточне" — таблиця мала (десятки
    рядків максимум), тож дешевше й надійніше за диффінг по id."""
    if not ENABLED:
        return False

    # Видаляємо все (id завжди > 0, unix ms timestamp)
    if _rest("DELETE", "route_alerts", params={"id": "gt.0"}) is None:
        return False

    if not alerts:
        return True

    rows = [
        {
            "id": a["id"],
            "kind": a.get("kind"),
            "route_number": a["routeNumber"],
            "message": a["message"],
            "created_at": a["createdAt"],
            "expires_at": a["expiresAt"],
            "source": a.get("source", "manual"),
        }
        for a in alerts
    ]
    result = _rest("POST", "route_alerts", json_body=rows, prefer="resolution=merge-duplicates,return=minimal")
    return result is not None


def insert_delay_reports(new_reports: list[dict]) -> bool:
    """Додає в лог тільки НОВІ скарги цього циклу (delay_reports —
    append-only лог подій, весь список переписувати не треба)."""
    if not ENABLED or not new_reports:
        return False

    rows = [
        {
            "user_id": r.get("userId"),
            "username": r.get("username"),
            "kind": r.get("kind"),
            "route_number": r["routeNumber"],
            "comment": r.get("comment") or None,
            "created_at": r["createdAt"],
        }
        for r in new_reports
    ]
    result = _rest("POST", "delay_reports", json_body=rows, prefer="return=minimal")
    return result is not None
