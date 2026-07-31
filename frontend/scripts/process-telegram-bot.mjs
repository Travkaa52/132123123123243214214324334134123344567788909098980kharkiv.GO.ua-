#!/usr/bin/env node
/**
 * scripts/process-telegram-bot.mjs
 * ---------------------------------------------------------------------------
 * Замінює собою "живого" бота. Оскільки застосунок живе на GitHub Pages
 * (тільки статичні файли) і GitHub Actions (задачі за розкладом, а не
 * процес, що постійно слухає з'єднання), окремого сервера з long polling
 * тут бути не може. Замість цього:
 *
 *   - Цей скрипт запускається за розкладом (.github/workflows/telegram-bot.yml,
 *     раз на кілька хвилин) і один раз забирає нові events через
 *     Telegram Bot API (getUpdates), обробляє їх і завершується.
 *   - Користувач НЕ пише нікуди в застосунок напряму — кнопки в Mini App
 *     ("Повідомити про затримку", "Зв'язок з підтримкою") відкривають чат
 *     із ботом у Telegram (deep link t.me/<bot>?text=...) із заздалегідь
 *     заповненим повідомленням. Користувач сам тисне "Надіслати" в
 *     Telegram — так з'являється звичайне повідомлення від нього боту,
 *     яке цей скрипт забере на наступному запуску.
 *   - Адмін відповідає користувачу звичайним Reply в Telegram — це
 *     повністю нативний Telegram-досвід, без жодної веб-форми.
 *   - Результати (активні оголошення про затримку) складаються у
 *     public/data/route-alerts.json і комітяться назад у репозиторій —
 *     так само, як вже зроблено для notifications.json. GitHub Pages
 *     віддає цей файл як звичайний статичний JSON.
 *   - Технічний стан бота (offset для getUpdates, сирі скарги на
 *     затримку, відповідність "повідомлення в чаті адміна -> user id")
 *     зберігається в data-runtime/*.json — це не публічні дані, у
 *     public/ вони не потрапляють.
 * ---------------------------------------------------------------------------
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_CHAT_IDS = (process.env.ADMIN_CHAT_IDS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)
  .map(Number);

const DELAY_REPORT_THRESHOLD = Number(process.env.DELAY_REPORT_THRESHOLD || 5);
const DELAY_REPORT_WINDOW_MINUTES = Number(process.env.DELAY_REPORT_WINDOW_MINUTES || 60);
const DELAY_ALERT_DURATION_HOURS = Number(process.env.DELAY_ALERT_DURATION_HOURS || 2);

const RUNTIME_DIR = path.resolve('data-runtime');
const PUBLIC_ALERTS_PATH = path.resolve('public/data/route-alerts.json');

const OFFSET_FILE = path.join(RUNTIME_DIR, 'bot-offset.json');
const DELAY_REPORTS_FILE = path.join(RUNTIME_DIR, 'delay-reports.json');
const SUPPORT_MAP_FILE = path.join(RUNTIME_DIR, 'support-map.json');
const PENDING_PROMPTS_FILE = path.join(RUNTIME_DIR, 'pending-alert-prompts.json');

const KIND_LABELS = {
  bus: 'Автобус',
  trolleybus: 'Тролейбус',
  tram: 'Трамвай',
  metro: 'Метро'
};

// --- маленькі хелпери роботи з JSON-файлами стану ---------------------------

async function readJson(file, fallback) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch {
    return fallback;
  }
}

async function writeJson(file, data) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

// --- Telegram Bot API ---------------------------------------------------

const API_BASE = `https://api.telegram.org/bot${BOT_TOKEN}`;

async function tg(method, payload) {
  const res = await fetch(`${API_BASE}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await res.json();
  if (!data.ok) {
    console.error(`Telegram API error in ${method}:`, data.description);
  }
  return data;
}

function sendMessage(chatId, text, extra = {}) {
  return tg('sendMessage', { chat_id: chatId, text, ...extra });
}

function isAdminChat(chatId) {
  return ADMIN_CHAT_IDS.includes(Number(chatId));
}

function userLabel(userId, username, displayName) {
  const handle = username ? `@${username}` : displayName || 'без імені';
  return `${handle} (id ${userId})`;
}

// Структурована скарга на затримку кодується як прихований префікс у тексті,
// який користувач надсилає боту (додається автоматично в deep link,
// див. src/lib/reportDelay.ts). Формат: "#delay:<kind|_>:<routeNumber>#"
const DELAY_TAG_RE = /^#delay:([a-z_]+):([^\s#]+)#\s*/;

// Так само для підтримки, щоб відрізняти від "просто повідомлення" (не обов'язково,
// але дозволяє показати гарний текст адміну): "#support#"
const SUPPORT_TAG_RE = /^#support#\s*/;

async function main() {
  if (!BOT_TOKEN) {
    console.log('BOT_TOKEN не задано (секрет репозиторію) — пропускаю запуск.');
    return;
  }
  if (!ADMIN_CHAT_IDS.length) {
    console.log('ADMIN_CHAT_IDS не задано — нема кому надсилати сповіщення.');
  }

  const offsetState = await readJson(OFFSET_FILE, { lastUpdateId: 0 });
  let delayReports = await readJson(DELAY_REPORTS_FILE, []);
  let supportMap = await readJson(SUPPORT_MAP_FILE, []); // [{chatId, messageId, userId}]
  let pendingPrompts = await readJson(PENDING_PROMPTS_FILE, []); // [{routeNumber, kind, createdAt}]
  let alerts = (await readJson(PUBLIC_ALERTS_PATH, { items: [] })).items || [];

  const now = Date.now() / 1000;

  const updatesRes = await tg('getUpdates', {
    offset: offsetState.lastUpdateId + 1,
    timeout: 0,
    allowed_updates: ['message', 'callback_query']
  });
  const updates = updatesRes.ok ? updatesRes.result : [];

  for (const update of updates) {
    offsetState.lastUpdateId = Math.max(offsetState.lastUpdateId, update.update_id);

    if (update.callback_query) {
      await handleCallbackQuery(update.callback_query);
      continue;
    }

    const message = update.message;
    if (!message) continue;

    if (message.text?.startsWith('/start') && message.chat.type === 'private') {
      await sendMessage(
        message.chat.id,
        '👋 Вітаємо в Kharkiv GO!\n\n' +
          'Повідомлення, надіслані сюди, автоматично йдуть у підтримку — ми відповімо прямо в цьому чаті.\n\n' +
          `Ваш chat_id (для налаштування адмінів): ${message.chat.id}`
      );
      continue;
    }

    if (message.text?.startsWith('/alert') && isAdminChat(message.chat.id)) {
      await handleAlertCommand(message, alerts);
      continue;
    }

    if (!message.text) continue;

    // Reply адміна на переслане звернення користувача
    if (isAdminChat(message.chat.id) && message.reply_to_message) {
      const mapping = supportMap.find(
        (m) => m.chatId === message.chat.id && m.messageId === message.reply_to_message.message_id
      );
      if (mapping) {
        await sendMessage(mapping.userId, `💬 Відповідь від підтримки Kharkiv GO:\n\n${message.text}`);
        await tg('sendMessage', { chat_id: message.chat.id, text: '✅ Відповідь надіслано користувачу.', reply_to_message_id: message.message_id });
      }
      continue;
    }

    if (isAdminChat(message.chat.id)) continue; // адмін пише щось інше — ігноруємо
    if (message.chat.type !== 'private') continue;

    const from = message.from || {};
    const delayMatch = message.text.match(DELAY_TAG_RE);

    if (delayMatch) {
      const [, kindRaw, routeNumber] = delayMatch;
      const kind = kindRaw === '_' ? null : kindRaw;
      const comment = message.text.replace(DELAY_TAG_RE, '').trim();

      delayReports.push({
        userId: from.id,
        username: from.username || null,
        kind,
        routeNumber,
        comment,
        createdAt: Date.now() / 1000
      });

      const kindLabel = KIND_LABELS[kind] || 'Транспорт';
      let text = `🚨 Скарга на затримку\nМаршрут: ${routeNumber} (${kindLabel})\nВід: ${userLabel(from.id, from.username, from.first_name)}`;
      if (comment) text += `\nКоментар: ${comment}`;
      for (const chatId of ADMIN_CHAT_IDS) {
        await sendMessage(chatId, text);
      }
      await sendMessage(message.chat.id, '✅ Дякуємо! Скаргу на затримку передано адміністратору.');
      continue;
    }

    // Звичайне звернення в підтримку (в т.ч. з тегом #support#, якщо прийшло з app)
    const text = message.text.replace(SUPPORT_TAG_RE, '').trim();
    if (!text) continue;

    const header =
      `💬 Нове звернення в підтримку\n` +
      `Від: ${userLabel(from.id, from.username, from.first_name)}\n\n${text}\n\n` +
      `— Щоб відповісти користувачу, зробіть Reply на це повідомлення.`;

    for (const chatId of ADMIN_CHAT_IDS) {
      const sent = await tg('sendMessage', { chat_id: chatId, text: header });
      if (sent.ok) {
        supportMap.push({ chatId: sent.result.chat.id, messageId: sent.result.message_id, userId: from.id });
      }
    }
    await sendMessage(message.chat.id, '✅ Дякуємо! Ваше повідомлення передано в підтримку. Відповімо тут же, в цьому чаті.');
  }

  // --- поріг скарг -> запропонувати адміну оголосити затримку -------------
  const windowStart = now - DELAY_REPORT_WINDOW_MINUTES * 60;
  const byRoute = new Map();
  for (const r of delayReports) {
    if (r.createdAt < windowStart) continue;
    const key = `${r.routeNumber}::${r.kind || '_'}`;
    if (!byRoute.has(key)) byRoute.set(key, new Set());
    byRoute.get(key).add(r.userId);
  }

  for (const [key, userSet] of byRoute) {
    const [routeNumber, kindRaw] = key.split('::');
    const kind = kindRaw === '_' ? null : kindRaw;
    if (userSet.size < DELAY_REPORT_THRESHOLD) continue;

    const hasActiveAlert = alerts.some(
      (a) => a.routeNumber === routeNumber && (a.kind == null || a.kind === kind) && a.expiresAt > now
    );
    if (hasActiveAlert) continue;

    const alreadyPrompted = pendingPrompts.some((p) => p.routeNumber === routeNumber && p.kind === kind);
    if (alreadyPrompted) continue;

    const kindLabel = KIND_LABELS[kind] || 'Транспорт';
    const text =
      `⚠️ Увага! ${userSet.size} різних користувачів поскаржились на затримку маршруту ` +
      `${routeNumber} (${kindLabel}) за останні ${DELAY_REPORT_WINDOW_MINUTES} хв.\n\n` +
      `Опублікувати оголошення про затримку в застосунку?`;
    const keyboard = {
      inline_keyboard: [[{ text: '✅ Так, оголосити затримку', callback_data: `confirm_alert:${routeNumber}:${kind || '-'}` }]]
    };
    for (const chatId of ADMIN_CHAT_IDS) {
      await sendMessage(chatId, text, { reply_markup: keyboard });
    }
    pendingPrompts.push({ routeNumber, kind, createdAt: now });
  }

  // --- прибирання: старі скарги/мапи/протухлі оголошення -------------------
  delayReports = delayReports.filter((r) => r.createdAt >= windowStart - 3600);
  supportMap = supportMap.slice(-500);
  pendingPrompts = pendingPrompts.filter((p) => now - p.createdAt < DELAY_REPORT_WINDOW_MINUTES * 60);
  alerts = alerts.filter((a) => a.expiresAt > now - 86400);

  await writeJson(OFFSET_FILE, offsetState);
  await writeJson(DELAY_REPORTS_FILE, delayReports);
  await writeJson(SUPPORT_MAP_FILE, supportMap);
  await writeJson(PENDING_PROMPTS_FILE, pendingPrompts);
  await writeJson(PUBLIC_ALERTS_PATH, { updatedAt: new Date().toISOString(), items: alerts });

  // --- вкладені функції, яким треба читати/писати alerts/pendingPrompts ----

  async function handleCallbackQuery(cq) {
    if (!isAdminChat(cq.message.chat.id)) {
      await tg('answerCallbackQuery', { callback_query_id: cq.id, text: 'Недостатньо прав', show_alert: true });
      return;
    }
    const [, routeNumber, kindRaw] = (cq.data || '').split(':');
    if (!routeNumber) return;
    const kind = kindRaw === '-' ? null : kindRaw;

    const lastReport = [...delayReports].reverse().find((r) => r.routeNumber === routeNumber && (kind == null || r.kind === kind));
    let text = `Можлива затримка руху маршруту ${routeNumber}. Повідомляють кілька пасажирів.`;
    if (lastReport?.comment) text += ` Коментар: ${lastReport.comment.slice(0, 200)}`;

    alerts.push({
      id: Date.now(),
      kind,
      routeNumber,
      message: text,
      createdAt: now,
      expiresAt: now + DELAY_ALERT_DURATION_HOURS * 3600,
      source: 'auto'
    });
    pendingPrompts = pendingPrompts.filter((p) => !(p.routeNumber === routeNumber && p.kind === kind));

    await tg('editMessageText', {
      chat_id: cq.message.chat.id,
      message_id: cq.message.message_id,
      text: `${cq.message.text}\n\n✅ Підтверджено. Оголошення активне ${DELAY_ALERT_DURATION_HOURS} год.`
    });
    await tg('answerCallbackQuery', { callback_query_id: cq.id, text: 'Оголошення опубліковано в застосунку' });
  }

  function handleAlertCommand(message, alertsArr) {
    // /alert <номер> [bus|tram|trolleybus|metro] <текст>
    const parts = message.text.split(/\s+/);
    if (parts.length < 3) {
      return sendMessage(
        message.chat.id,
        'Формат: /alert <номер_маршруту> [вид: bus/tram/trolleybus/metro] <текст оголошення>'
      );
    }
    const routeNumber = parts[1];
    let kind = null;
    let textStartIdx = 2;
    if (['bus', 'tram', 'trolleybus', 'metro'].includes(parts[2].toLowerCase())) {
      kind = parts[2].toLowerCase();
      textStartIdx = 3;
    }
    const alertText = message.text.split(/\s+/).slice(textStartIdx).join(' ').trim();
    if (!alertText) {
      return sendMessage(message.chat.id, 'Не вистачає тексту оголошення.');
    }
    alertsArr.push({
      id: Date.now(),
      kind,
      routeNumber,
      message: alertText,
      createdAt: now,
      expiresAt: now + DELAY_ALERT_DURATION_HOURS * 3600,
      source: 'manual'
    });
    return sendMessage(message.chat.id, `✅ Оголошення створено для маршруту ${routeNumber} на ${DELAY_ALERT_DURATION_HOURS} год.`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
