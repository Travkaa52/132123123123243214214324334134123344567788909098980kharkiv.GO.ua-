# Python-бот Kharkiv GO (опційно, для near-real-time)

За замовчуванням боту НЕ потрібен окремий сервер: `.github/workflows/telegram-bot.yml`
прокидається кожні 3 год і ~1 год тримає активне long-polling чергування, обробляючи все саме (див. корінь репозиторію →
`INTEGRATION_NOTES_UK.md`). Це безкоштовно й достатньо для більшості випадків.

Цей файл (`telegram_bot.py`) — той самий протокол/логіка, але постійний
процес (long polling), якщо у вас є VPS/домашній сервер і хочеться, щоб
відповідь адміна і банер про затримку зʼявлялись миттєво, а не за кілька
хвилин.

## Встановлення

```bash
cd bot
python3 -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
```

Відредагуйте `.env` — вкажіть `BOT_TOKEN` (той самий, що видав @BotFather) і
`ADMIN_CHAT_IDS`.

## Запуск

```bash
python telegram_bot.py
```

Скрипт читає й пише ті самі файли, що й GitHub Actions-версія:
- `frontend/data-runtime/*.json` — технічний стан (не публічний)
- `frontend/public/data/route-alerts.json` — публічні активні оголошення

Після кожної обробленої пачки повідомлень скрипт **сам комітить і пушить**
зміни в git (`AUTO_GIT_PUSH=true` за замовчуванням) — тільки так оновлення
дійде до вже задеплоєного на GitHub Pages сайту. Для цього:
- скрипт має запускатись усередині клона репозиторію (типово: поруч з
  `frontend/`, тобто `<repo>/bot/telegram_bot.py`);
- у git має бути налаштований push-доступ (SSH-ключ або HTTPS-токен у
  origin URL) під тим користувачем/сервісним акаунтом, від імені якого
  запущено скрипт.

Якщо не хочете автопуш (наприклад, тестуєте локально) — виставте
`AUTO_GIT_PUSH=false` в `.env`.

## Тримати запущеним

Найпростіше — `systemd`-сервіс або `screen`/`tmux`. Приклад `systemd`:

```ini
# /etc/systemd/system/kharkivgo-bot.service
[Unit]
Description=Kharkiv GO Telegram bot
After=network.target

[Service]
WorkingDirectory=/шлях/до/repo/bot
ExecStart=/шлях/до/repo/bot/venv/bin/python telegram_bot.py
Restart=always
RestartSec=5
EnvironmentFile=/шлях/до/repo/bot/.env

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now kharkivgo-bot
```

## Чи можна тримати ввімкненими і скрипт, і GitHub Actions workflow одночасно?

Так, конфлікту немає — `getUpdates` із зростаючим `offset` виключає
дублікати обробки одного й того ж повідомлення незалежно від того, хто
першим його забрав. Але сенсу тримати обидва зазвичай нема (Actions і так
підхопить усе, що встиг оновити скрипт) — просто вимкніть workflow
(Actions → Telegram Bot → ... → Disable workflow), якщо цей скрипт працює
постійно.
