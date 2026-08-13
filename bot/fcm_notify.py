"""
bot/fcm_notify.py
------------------------------------------------------------------------------
Розсилка push-сповіщень про затримку маршруту підписаним користувачам
(колекція Firestore `pushSubscriptions`, див. frontend/src/lib/firebase.ts
і frontend/src/lib/pushSubscription.ts). Викликається з telegram_bot.py
одразу після створення нового route-alert.

Дзеркало frontend/scripts/fcmNotify.mjs (Node-версія для GitHub Actions) —
та сама модель даних, той самий service account.

FIREBASE_SERVICE_ACCOUNT_JSON (.env / середовище) — вміст service-account
ключа (Firebase Console → Project settings → Service accounts → Generate
new private key), як є (JSON) або в base64. Якщо не задано — усі функції
нижче тихо нічого не роблять, решта бота працює як і раніше.

Залежності (bot/requirements.txt): google-auth.
"""
from __future__ import annotations

import base64
import json
import logging
import os
from typing import Any, Optional

import requests

log = logging.getLogger("kharkivgo-bot.fcm")

_RAW_SERVICE_ACCOUNT = os.getenv("FIREBASE_SERVICE_ACCOUNT_JSON", "").strip()


def _parse_service_account(raw: str) -> Optional[dict]:
    if not raw:
        return None
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        try:
            return json.loads(base64.b64decode(raw).decode("utf-8"))
        except Exception:
            return None


_service_account = _parse_service_account(_RAW_SERVICE_ACCOUNT)

FCM_ENABLED = bool(_service_account and _service_account.get("client_email") and _service_account.get("private_key"))

if not _RAW_SERVICE_ACCOUNT:
    log.info("FIREBASE_SERVICE_ACCOUNT_JSON не задано — push-сповіщення про затримки вимкнені.")
elif not FCM_ENABLED:
    log.warning("FIREBASE_SERVICE_ACCOUNT_JSON задано, але не вдалося розпарсити — push вимкнені.")

_PROJECT_ID = (_service_account or {}).get("project_id")
_FIRESTORE_BASE = f"https://firestore.googleapis.com/v1/projects/{_PROJECT_ID}/databases/(default)/documents"
_FCM_SEND_URL = f"https://fcm.googleapis.com/v1/projects/{_PROJECT_ID}/messages:send"
_SCOPES = [
    "https://www.googleapis.com/auth/datastore",
    "https://www.googleapis.com/auth/firebase.messaging",
]

_credentials = None


def _get_access_token() -> Optional[str]:
    global _credentials
    if not FCM_ENABLED:
        return None
    try:
        from google.auth.transport.requests import Request as GoogleAuthRequest
        from google.oauth2 import service_account
    except ImportError:
        log.warning("Пакет google-auth не встановлено (pip install google-auth) — push вимкнені.")
        return None

    if _credentials is None:
        _credentials = service_account.Credentials.from_service_account_info(_service_account, scopes=_SCOPES)
    if not _credentials.valid:
        _credentials.refresh(GoogleAuthRequest())
    return _credentials.token


def _fs_value_to_plain(value: dict) -> Any:
    if value is None:
        return None
    if "stringValue" in value:
        return value["stringValue"]
    if "booleanValue" in value:
        return value["booleanValue"]
    if "integerValue" in value:
        return int(value["integerValue"])
    if "doubleValue" in value:
        return value["doubleValue"]
    if "arrayValue" in value:
        return [_fs_value_to_plain(v) for v in value["arrayValue"].get("values", [])]
    return None


def _fs_doc_to_plain(doc: dict) -> dict:
    out = {"id": doc["name"].rsplit("/", 1)[-1]}
    for key, value in doc.get("fields", {}).items():
        out[key] = _fs_value_to_plain(value)
    return out


def _list_push_subscriptions(token: str) -> list[dict]:
    docs: list[dict] = []
    page_token = None
    while True:
        params = {"pageSize": 300}
        if page_token:
            params["pageToken"] = page_token
        try:
            resp = requests.get(
                f"{_FIRESTORE_BASE}/pushSubscriptions",
                headers={"Authorization": f"Bearer {token}"},
                params=params,
                timeout=15,
            )
        except requests.RequestException as e:
            log.warning("Firestore listDocuments мережева помилка: %s", e)
            break
        if not resp.ok:
            log.warning("Firestore listDocuments помилка: %s %s", resp.status_code, resp.text[:300])
            break
        data = resp.json()
        docs.extend(_fs_doc_to_plain(d) for d in data.get("documents", []))
        page_token = data.get("nextPageToken")
        if not page_token:
            break
    return docs


def _disable_invalid_subscription(token: str, uid: str) -> None:
    try:
        requests.patch(
            f"{_FIRESTORE_BASE}/pushSubscriptions/{uid}",
            headers={"Authorization": f"Bearer {token}"},
            params={"updateMask.fieldPaths": ["enabled", "fcmToken"]},
            json={"fields": {"enabled": {"booleanValue": False}}},
            timeout=15,
        )
    except requests.RequestException:
        pass


def notify_delay_subscribers(route_number: str, kind: Optional[str], alert_message: str) -> dict:
    """Надсилає push про затримку всім підписаним на цей маршрут (або на весь
    вид транспорту `kind`). Тихо повертає {"sent": 0, ...}, якщо FCM вимкнено
    чи підписників немає — виклик завжди безпечний, навіть без налаштувань.

    Крім переліку FCM push, у відповіді повертається "telegram_ids" —
    унікальний список Telegram chat_id підписників на цей маршрут, у яких
    у документі pushSubscriptions/{uid} збережено поле telegramId (записується
    фронтендом при увімкненні сповіщень, якщо Mini App відкрито з Telegram —
    див. frontend/src/lib/pushSubscription.ts). Викликач (telegram_bot.py)
    сам розсилає цим id особисті повідомлення від бота — тут ми лише
    визначаємо, кому саме."""
    if not FCM_ENABLED:
        return {"sent": 0, "skipped": "disabled", "telegram_ids": []}

    token = _get_access_token()
    if not token:
        return {"sent": 0, "skipped": "no-token", "telegram_ids": []}

    subs = _list_push_subscriptions(token)
    route_str = str(route_number)
    targets = []
    telegram_ids: list[int] = []
    seen_telegram_ids: set[int] = set()
    for s in subs:
        if not s.get("enabled"):
            continue
        routes = [str(r) for r in (s.get("routes") or [])]
        if not (route_str in routes or (kind and kind in routes)):
            continue

        tg_id = s.get("telegramId")
        if tg_id is not None:
            try:
                tg_id = int(tg_id)
            except (TypeError, ValueError):
                tg_id = None
        if tg_id is not None and tg_id not in seen_telegram_ids:
            seen_telegram_ids.add(tg_id)
            telegram_ids.append(tg_id)

        if s.get("fcmToken"):
            targets.append(s)

    if not targets:
        return {"sent": 0, "skipped": "no-subscribers", "telegram_ids": telegram_ids}

    title = "Kharkiv GO — затримка руху"
    body = alert_message if len(alert_message) <= 180 else alert_message[:177] + "..."

    sent = 0
    for sub in targets:
        payload = {
            "message": {
                "token": sub["fcmToken"],
                "notification": {"title": title, "body": body},
                "data": {"routeNumber": route_str, "kind": kind or "", "url": "/"},
                "webpush": {"fcm_options": {"link": "/"}},
            }
        }
        try:
            resp = requests.post(
                _FCM_SEND_URL,
                headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
                json=payload,
                timeout=15,
            )
        except requests.RequestException as e:
            log.warning("FCM send виняток для %s: %s", sub["id"], e)
            continue
        if resp.ok:
            sent += 1
            continue
        status = (resp.json().get("error", {}) or {}).get("status") if resp.content else None
        if status in ("NOT_FOUND", "UNREGISTERED", "INVALID_ARGUMENT"):
            _disable_invalid_subscription(token, sub["id"])
        else:
            log.warning("FCM send помилка для %s: %s", sub["id"], status or resp.status_code)

    log.info("Push про затримку маршруту %s: надіслано %s/%s.", route_str, sent, len(targets))
    return {"sent": sent, "total": len(targets), "telegram_ids": telegram_ids}
