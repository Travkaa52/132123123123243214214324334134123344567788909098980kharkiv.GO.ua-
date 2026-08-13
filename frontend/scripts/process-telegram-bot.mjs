#!/usr/bin/env node
/**
 * scripts/process-telegram-bot.mjs
 * ---------------------------------------------------------------------------
 * Ультра-зручний та розширений бот для KharkivGO.
 * Працює в режимі long-polling через GitHub Actions / Node.js.
 * Повністю підтримує інтерактивне Inline-меню для користувачів та адмінів.
 * ---------------------------------------------------------------------------
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { replaceRouteAlerts, insertDelayReports } from './supabaseSync.mjs';
import { notifyDelaySubscribers } from './fcmNotify.mjs';

const execFileAsync = promisify(execFile);

const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_CHAT_IDS = (process.env.ADMIN_CHAT_IDS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)
  .map(Number);

const DELAY_REPORT_THRESHOLD = Number(process.env.DELAY_REPORT_THRESHOLD || 5);
const DELAY_REPORT_WINDOW_MINUTES = Number(process.env.DELAY_REPORT_WINDOW_MINUTES || 60);
const DELAY_ALERT_DURATION_HOURS = Number(process.env.DELAY_ALERT_DURATION_HOURS || 2);

const RUN_DURATION_MINUTES = Number(process.env.RUN_DURATION_MINUTES || 55);
const POLL_TIMEOUT_SECONDS = Number(process.env.POLL_TIMEOUT_SECONDS || 25);
const AUTO_GIT_PUSH = (process.env.AUTO_GIT_PUSH ?? 'true').toLowerCase() !== 'false';

const RUNTIME_DIR = path.resolve('data-runtime');
const PUBLIC_ALERTS_PATH = path.resolve('public/data/route-alerts.json');

const OFFSET_FILE = path.join(RUNTIME_DIR, 'bot-offset.json');
const DELAY_REPORTS_FILE = path.join(RUNTIME_DIR, 'delay-reports.json');
const SUPPORT_MAP_FILE = path.join(RUNTIME_DIR, 'support-map.json');
const PENDING_PROMPTS_FILE = path.join(RUNTIME_DIR, 'pending-alert-prompts.json');
const ADMIN_STATES_FILE = path.join(RUNTIME_DIR, 'admin-states.json');
const KNOWN_USERS_FILE = path.join(RUNTIME_DIR, 'known-users.json');

const KIND_LABELS = {
  bus: '🚌 Автобус',
  trolleybus: '🚎 Тролейбус',
  tram: '🚋 Трамвай',
  metro: '🚇 Метро'
};

// --- Допоміжні функції роботи з JSON-файлами ---

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

async function gitCommitAndPush(message) {
  if (!AUTO_GIT_PUSH) return;
  const branch = process.env.GITHUB_REF_NAME || 'main';

  await execFileAsync('git', ['rebase', '--abort']).catch(() => {});
  await execFileAsync('git', ['merge', '--abort']).catch(() => {});

  try {
    await execFileAsync('git', ['add', 'data-runtime', 'public/data/route-alerts.json']);
    try {
      await execFileAsync('git', ['diff', '--cached', '--quiet']);
      return; // Змін немає — не комітимо
    } catch {
      // Зміни є — продовжуємо
    }

    await execFileAsync('git', ['commit', '-m', message]);

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        await execFileAsync('git', ['push', 'origin', `HEAD:${branch}`]);
        console.log(`[bot] Закомічено та запушено: ${message}`);
        return;
      } catch {
        if (attempt === 3) throw new Error('push відхилено після 3 спроб');
        await execFileAsync('git', ['fetch', 'origin', branch]);
        await execFileAsync('git', ['reset', '--mixed', `origin/${branch}`]);
        await execFileAsync('git', ['add', 'data-runtime', 'public/data/route-alerts.json']);
        await execFileAsync('git', ['commit', '-m', message]);
      }
    }
  } catch (err) {
    console.error('[bot] Не вдалося закомітити/запушити зміни:', err?.stderr || err?.message || err);
    await execFileAsync('git', ['rebase', '--abort']).catch(() => {});
    await execFileAsync('git', ['merge', '--abort']).catch(() => {});
  }
}

// --- Telegram API Helpers ---

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
  return tg('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', ...extra });
}

function escapeHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Розсилає особисте повідомлення від бота підписникам, чиї Telegram id
 * (chat_id) відомі — див. notifyDelaySubscribers() у fcmNotify.mjs та
 * frontend/src/lib/pushSubscription.ts (поле telegramId пишеться там,
 * коли Mini App відкрито з Telegram). Дублює push у Mini App і доходить
 * навіть тим, у кого не спрацював FCM-токен. Помилка з одним chat_id
 * (заблокував бота тощо) не перериває розсилку іншим.
 */
async function notifyDelaySubscribersInDm(routeNumber, kind, alertText, telegramIds) {
  if (!telegramIds || !telegramIds.length) return 0;
  const routeLabel =
    String(routeNumber).toLowerCase() === 'all' ? 'усі маршрути' : `маршрут ${escapeHtml(routeNumber)}`;
  const text = `🚦 Затримка: <b>${routeLabel}</b>${kind ? ` (${escapeHtml(kind)})` : ''}\n\n${escapeHtml(alertText)}`;

  let sent = 0;
  for (const id of telegramIds) {
    try {
      const result = await sendMessage(id, text);
      if (result?.ok) sent += 1;
    } catch (err) {
      console.warn(`[bot] Не вдалось надіслати ЛС про затримку підписнику ${id}:`, err?.message || err);
    }
  }
  return sent;
}

function editMessageText(chatId, messageId, text, extra = {}) {
  return tg('editMessageText', { chat_id: chatId, message_id: messageId, text, parse_mode: 'HTML', ...extra });
}

function isAdminChat(chatId) {
  return ADMIN_CHAT_IDS.includes(Number(chatId));
}

function userLabel(userId, username, displayName) {
  const handle = username ? `@${username}` : displayName || 'пасажир';
  return `${handle} (id: <code>${userId}</code>)`;
}

const DELAY_TAG_RE = /^#delay:([a-z_]+):([^\s#]+)#\s*/;
const SUPPORT_TAG_RE = /^#support#\s*/;

// --- Клавіатури Меню ---

function getMainMenuKeyboard(isAdmin = false) {
  const keyboard = [
    [
      { text: '🚨 Повідомити про затримку', callback_data: 'user_report_delay' },
      { text: '💬 Підтримка', callback_data: 'user_support_info' }
    ],
    [
      { text: 'ℹ️ Про KharkivGO', callback_data: 'user_about' }
    ]
  ];

  if (isAdmin) {
    keyboard.push([{ text: '⚙️ Адмін-панель', callback_data: 'admin_panel' }]);
  }

  return { inline_keyboard: keyboard };
}

function getAdminPanelKeyboard() {
  return {
    inline_keyboard: [
      [{ text: '📋 Активні оголошення', callback_data: 'admin_view_alerts' }],
      [{ text: '📢 Створити оголошення / затримку', callback_data: 'admin_create_alert_start' }],
      [{ text: '📊 Статистика скарг', callback_data: 'admin_stats' }],
      [{ text: '🔙 Головне меню', callback_data: 'go_main_menu' }]
    ]
  };
}

function getSelectKindKeyboard(prefix) {
  return {
    inline_keyboard: [
      [
        { text: '🚌 Автобус', callback_data: `${prefix}:bus` },
        { text: '🚎 Тролейбус', callback_data: `${prefix}:trolleybus` }
      ],
      [
        { text: '🚋 Трамвай', callback_data: `${prefix}:tram` },
        { text: '🚇 Метро', callback_data: `${prefix}:metro` }
      ],
      [{ text: '🌐 Весь транспорт (загальне)', callback_data: `${prefix}:all` }],
      [{ text: '🔙 Скасувати', callback_data: 'go_main_menu' }]
    ]
  };
}

// --- Основний цикл обробки ---

async function processCycle() {
  const offsetState = await readJson(OFFSET_FILE, { lastUpdateId: 0 });
  let delayReports = await readJson(DELAY_REPORTS_FILE, []);
  let supportMap = await readJson(SUPPORT_MAP_FILE, []);
  let pendingPrompts = await readJson(PENDING_PROMPTS_FILE, []);
  let adminStates = await readJson(ADMIN_STATES_FILE, {});
  let knownUsers = await readJson(KNOWN_USERS_FILE, []);
  let alerts = (await readJson(PUBLIC_ALERTS_PATH, { items: [] })).items || [];

  const now = Date.now() / 1000;
  const delayReportsBefore = delayReports.length;

  const updatesRes = await tg('getUpdates', {
    offset: offsetState.lastUpdateId + 1,
    timeout: POLL_TIMEOUT_SECONDS,
    allowed_updates: ['message', 'callback_query']
  });
  const updates = updatesRes.ok ? updatesRes.result : [];

  if (!updates.length) return false;

  for (const update of updates) {
    offsetState.lastUpdateId = Math.max(offsetState.lastUpdateId, update.update_id);

    // --- ОБРОБКА КНОПОК (Callback Queries) ---
    if (update.callback_query) {
      const cq = update.callback_query;
      const chatId = cq.message.chat.id;
      const data = cq.data || '';

      await tg('answerCallbackQuery', { callback_query_id: cq.id });

      if (data === 'go_main_menu') {
        delete adminStates[chatId];
        await editMessageText(
          chatId,
          cq.message.message_id,
          '👋 <b>Головне меню KharkivGO</b>\n\nОберіть потрібну дію за допомогою кнопок нижче:',
          { reply_markup: getMainMenuKeyboard(isAdminChat(chatId)) }
        );
        continue;
      }

      if (data === 'user_about') {
        await editMessageText(
          chatId,
          cq.message.message_id,
          '💙💛 <b>KharkivGO</b> — ваш надійний помічник у міському транспорті Харкова.\n\n' +
          '• Відстеження руху транспорту онлайн.\n' +
          '• Оперативні сповіщення про затори, ремонтні роботи та ДТП.\n' +
          '• Прямий зв’язок із диспетчерами та підтримкою.\n\n' +
          'Дякуємо, що допомагаєте робити транспорт зручнішим!',
          { reply_markup: { inline_keyboard: [[{ text: '🔙 Назад', callback_data: 'go_main_menu' }]] } }
        );
        continue;
      }

      if (data === 'user_support_info') {
        await editMessageText(
          chatId,
          cq.message.message_id,
          '💬 <b>Служба підтримки KharkivGO</b>\n\n' +
          'Просто напишіть будь-яке запитання, пропозицію чи скаргу прямим повідомленням у цей чат — ми отримаємо його і відповімо вам сюди ж!',
          { reply_markup: { inline_keyboard: [[{ text: '🔙 Назад', callback_data: 'go_main_menu' }]] } }
        );
        continue;
      }

      if (data === 'user_report_delay') {
        await editMessageText(
          chatId,
          cq.message.message_id,
          '🚨 <b>Повідомити про затримку</b>\n\nОберіть вид транспорту:',
          { reply_markup: getSelectKindKeyboard('user_delay_kind') }
        );
        continue;
      }

      if (data.startsWith('user_delay_kind:')) {
        const kind = data.split(':')[1];
        const kindLabel = KIND_LABELS[kind] || 'Транспорт';
        await editMessageText(
          chatId,
          cq.message.message_id,
          `🚨 <b>Скарга на затримку (${kindLabel})</b>\n\n` +
          `Напишіть номер маршруту та коротко описати ситуацію у відповідь на це повідомлення.\n\n` +
          `<i>Приклад: 27 затримується на 15 хв біля станції метро</i>`,
          { reply_markup: { inline_keyboard: [[{ text: '🔙 Скасувати', callback_data: 'go_main_menu' }]] } }
        );
        continue;
      }

      // --- АДМІН-ФУНКЦІОНАЛ ---
      if (isAdminChat(chatId)) {
        if (data === 'admin_panel') {
          await editMessageText(chatId, cq.message.message_id, '⚙️ <b>Панель адміністратора KharkivGO</b>', {
            reply_markup: getAdminPanelKeyboard()
          });
          continue;
        }

        if (data === 'admin_view_alerts') {
          await handleAlertsCommand(chatId, alerts, now);
          continue;
        }

        if (data === 'admin_stats') {
          const windowStart = now - DELAY_REPORT_WINDOW_MINUTES * 60;
          const recentReports = delayReports.filter((r) => r.createdAt >= windowStart);
          await editMessageText(
            chatId,
            cq.message.message_id,
            `📊 <b>Статистика скарг за останні ${DELAY_REPORT_WINDOW_MINUTES} хв:</b>\n\n` +
            `• Всього отримано скарг: <b>${recentReports.length}</b>\n` +
            `• Унікальних дописувачів: <b>${new Set(recentReports.map(r => r.userId)).size}</b>\n\n` +
            `<i>Поріг авто-сповіщення: ${DELAY_REPORT_THRESHOLD} скарг на маршрут.</i>`,
            { reply_markup: { inline_keyboard: [[{ text: '🔙 В адмін-панель', callback_data: 'admin_panel' }]] } }
          );
          continue;
        }

        if (data === 'admin_create_alert_start') {
          await editMessageText(chatId, cq.message.message_id, '📢 <b>Оберіть вид транспорту для оголошення:</b>', {
            reply_markup: getSelectKindKeyboard('admin_alert_kind')
          });
          continue;
        }

        if (data.startsWith('admin_alert_kind:')) {
          const kind = data.split(':')[1];
          adminStates[chatId] = { step: 'awaiting_alert_text', kind: kind === 'all' ? null : kind };
          await editMessageText(
            chatId,
            cq.message.message_id,
            `📝 <b>Введіть текст оголошення</b>\n\n` +
            `Надішліть номер маршруту та текст у форматі:\n` +
            `<code>[номер_маршруту] [текст оголошення]</code>\n\n` +
            `<i>Приклад: 27 Затримка 20 хв через ДТП на Салтівці</i>\n` +
            `<i>Або для всіх маршрутів: all Тимчасові збої руху по всьому місту</i>`,
            { reply_markup: { inline_keyboard: [[{ text: '🔙 Скасувати', callback_data: 'admin_panel' }]] } }
          );
          continue;
        }

        if (data.startsWith('cancel_alert:')) {
          const alertId = Number(data.split(':')[1]);
          const before = alerts.length;
          const removed = alerts.find((a) => a.id === alertId);
          alerts = alerts.filter((a) => a.id !== alertId);
          const didRemove = alerts.length !== before;

          await editMessageText(
            chatId,
            cq.message.message_id,
            didRemove
              ? `🗑 <b>Оголошення скасовано!</b>\n<b>Маршрут:</b> ${removed?.routeNumber || 'Загальне'}`
              : '❌ Оголошення вже скасоване або застаріло.',
            { reply_markup: { inline_keyboard: [[{ text: '⚙️ В адмін-панель', callback_data: 'admin_panel' }]] } }
          );
          continue;
        }

        if (data.startsWith('confirm_alert:')) {
          const [, routeNumber, kindRaw] = data.split(':');
          const kind = kindRaw === '-' ? null : kindRaw;
          const lastReport = [...delayReports].reverse().find((r) => r.routeNumber === routeNumber);

          let text = `Можлива затримка руху маршруту ${routeNumber}. Повідомляють кілька пасажирів.`;
          if (lastReport?.comment) text += ` Коментар: ${lastReport.comment.slice(0, 150)}`;

          const newAlertId = Date.now();
          alerts.push({
            id: newAlertId,
            kind,
            routeNumber,
            message: text,
            createdAt: now,
            expiresAt: now + DELAY_ALERT_DURATION_HOURS * 3600,
            source: 'auto'
          });

          pendingPrompts = pendingPrompts.filter((p) => !(p.routeNumber === routeNumber && p.kind === kind));

          try {
            const result = await notifyDelaySubscribers(routeNumber, kind, text);
            await notifyDelaySubscribersInDm(routeNumber, kind, text, result?.telegramIds);
          } catch (err) {
            console.error('[bot] notifyDelaySubscribers впав — оголошення все одно опубліковано в застосунку.', err);
          }

          await editMessageText(
            chatId,
            cq.message.message_id,
            `✅ <b>Оголошення підтверджено та опубліковано у застосунку!</b>\nМаршрут: ${routeNumber} (активне ${DELAY_ALERT_DURATION_HOURS} год.)`,
            {
              reply_markup: {
                inline_keyboard: [[{ text: '🗑 Скасувати достроково', callback_data: `cancel_alert:${newAlertId}` }]]
              }
            }
          );
          continue;
        }
      }

      continue;
    }

    // --- ОБРОБКА ЗВИЧАЙНИХ ПОВІДОМЛЕНЬ ---
    const message = update.message;
    if (!message || !message.text) continue;

    const chatId = message.chat.id;
    const from = message.from || {};

    // Команда /start (З перевіркою нового користувача)
    if (message.text.startsWith('/start')) {
      delete adminStates[chatId];
      const isNew = !knownUsers.includes(chatId);
      if (isNew) {
        knownUsers.push(chatId);
      }

      const welcomeText = isNew
        ? `👋 <b>Ласкаво просимо до KharkivGO, ${from.first_name || 'пасажире'}!</b>\n\n` +
          `Це офіційний бот для відстеження міського транспорту Харкова.\n\n` +
          `<b>Що тут можна робити:</b>\n` +
          `• 🚨 <b>Повідомити про затримку:</b> якщо транспорт затримується, оперативно передайте це диспетчеру.\n` +
          `• 💬 <b>Зв'язатися з підтримкою:</b> просто напишіть повідомлення сюди, і ми відповімо.\n` +
          `• 🔔 <b>Отримувати важливі сповіщення:</b> дізнавайтеся про ремонти доріг та зміни маршрутів.\n\n` +
          `Скористайтеся кнопками нижче:`
        : `👋 <b>З поверненням, ${from.first_name || 'пасажире'}!</b>\n\nОберіть потрібний розділ меню:`;

      await sendMessage(chatId, welcomeText, {
        reply_markup: getMainMenuKeyboard(isAdminChat(chatId))
      });
      continue;
    }

    // Команда /admin
    if (message.text.startsWith('/admin') && isAdminChat(chatId)) {
      await sendMessage(chatId, '⚙️ <b>Панель адміністратора KharkivGO</b>', {
        reply_markup: getAdminPanelKeyboard()
      });
      continue;
    }

    // Адмін вводить текст для нового оголошення
    if (isAdminChat(chatId) && adminStates[chatId]?.step === 'awaiting_alert_text') {
      const kind = adminStates[chatId].kind;
      delete adminStates[chatId];

      const parts = message.text.trim().split(/\s+/);
      const routeNumber = parts[0];
      const alertText = parts.slice(1).join(' ');

      if (!routeNumber || !alertText) {
        await sendMessage(chatId, '❌ <b>Помилка формату!</b> Потрібно: <code>[номер] [текст]</code>. Спробуйте ще раз з адмін-панелі.', {
          reply_markup: getAdminPanelKeyboard()
        });
        continue;
      }

      const alertId = Date.now();
      alerts.push({
        id: alertId,
        kind,
        routeNumber,
        message: alertText,
        createdAt: now,
        expiresAt: now + DELAY_ALERT_DURATION_HOURS * 3600,
        source: 'manual'
      });

      let dmSent = 0;
      try {
        const result = await notifyDelaySubscribers(routeNumber, kind, alertText);
        dmSent = await notifyDelaySubscribersInDm(routeNumber, kind, alertText, result?.telegramIds);
      } catch (err) {
        console.error('[bot] notifyDelaySubscribers впав — оголошення все одно опубліковано в застосунку.', err);
      }

      await sendMessage(
        chatId,
        `✅ <b>Оголошення опубліковано!</b>\n\n<b>Маршрут:</b> ${routeNumber}\n<b>Текст:</b> ${alertText}\n📨 Особисто в Telegram сповіщено: ${dmSent}.`,
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: '🗑 Скасувати достроково', callback_data: `cancel_alert:${alertId}` }],
              [{ text: '⚙️ В адмін-панель', callback_data: 'admin_panel' }]
            ]
          }
        }
      );
      continue;
    }

    // Reply Адміна на повідомлення підтримки
    if (isAdminChat(chatId) && message.reply_to_message) {
      const mapping = supportMap.find(
        (m) => m.chatId === chatId && m.messageId === message.reply_to_message.message_id
      );
      if (mapping) {
        await sendMessage(mapping.userId, `💬 <b>Відповідь підтримки KharkivGO:</b>\n\n${message.text}`);
        await sendMessage(chatId, '✅ <b>Відповідь відправлено користувачу!</b>', {
          reply_to_message_id: message.message_id
        });
      } else {
        await sendMessage(chatId, '⚠️ Оригінальне звернення не знайдено.');
      }
      continue;
    }

    if (isAdminChat(chatId)) continue; // Ігноруємо довільний текст від адмінів без контексту

    // Обробка скарги з App
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
        createdAt: now
      });

      const kindLabel = KIND_LABELS[kind] || 'Транспорт';
      let adminNotice = `🚨 <b>Нова скарга на затримку!</b>\n\n<b>Маршрут:</b> ${routeNumber} (${kindLabel})\n<b>Від:</b> ${userLabel(from.id, from.username, from.first_name)}`;
      if (comment) adminNotice += `\n<b>Коментар:</b> ${comment}`;

      for (const adminId of ADMIN_CHAT_IDS) {
        await sendMessage(adminId, adminNotice);
      }
      await sendMessage(chatId, '✅ <b>Дякуємо!</b> Скаргу на затримку передано диспетчеру.', {
        reply_markup: getMainMenuKeyboard(false)
      });
      continue;
    }

    // Звичайне звернення в підтримку
    const text = message.text.replace(SUPPORT_TAG_RE, '').trim();
    if (!text) continue;

    const header =
      `💬 <b>Нове звернення в підтримку</b>\n` +
      `<b>Від:</b> ${userLabel(from.id, from.username, from.first_name)}\n\n` +
      `${text}\n\n` +
      `<i>💡 Зробіть Reply на це повідомлення, щоб відповісти.</i>`;

    for (const adminId of ADMIN_CHAT_IDS) {
      const sent = await sendMessage(adminId, header);
      if (sent.ok) {
        supportMap.push({ chatId: sent.result.chat.id, messageId: sent.result.message_id, userId: from.id });
      }
    }
    await sendMessage(chatId, '✅ <b>Дякуємо!</b> Ваше повідомлення отримано. Ми відповімо вам найближчим часом.', {
      reply_markup: getMainMenuKeyboard(false)
    });
  }

  // --- Перевірка порогу скарг для авто-сповіщення адмінів ---
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
    const alertPromptText =
      `⚠️ <b>Увага!</b> <b>${userSet.size}</b> пасажирів поскаржились на затримку маршруту ` +
      `<b>${routeNumber}</b> (${kindLabel}) за останні ${DELAY_REPORT_WINDOW_MINUTES} хв.\n\n` +
      `Опублікувати сповіщення про затримку в застосунку?`;

    for (const adminId of ADMIN_CHAT_IDS) {
      await sendMessage(adminId, alertPromptText, {
        reply_markup: {
          inline_keyboard: [[{ text: '✅ Оголосити затримку', callback_data: `confirm_alert:${routeNumber}:${kind || '-'}` }]]
        }
      });
    }
    pendingPrompts.push({ routeNumber, kind, createdAt: now });
  }

  // --- Збереження стану ---
  const newDelayReports = delayReports.slice(delayReportsBefore);
  if (newDelayReports.length && (await insertDelayReports(newDelayReports))) {
    console.log(`[bot] Supabase: додано ${newDelayReports.length} нову(і) скаргу(и).`);
  }

  delayReports = delayReports.filter((r) => r.createdAt >= windowStart - 3600);
  supportMap = supportMap.slice(-500);
  pendingPrompts = pendingPrompts.filter((p) => now - p.createdAt < DELAY_REPORT_WINDOW_MINUTES * 60);
  alerts = alerts.filter((a) => a.expiresAt > now - 86400);

  const activeAlerts = alerts.filter((a) => a.expiresAt > now);
  if (await replaceRouteAlerts(activeAlerts)) {
    console.log(`[bot] Supabase: route_alerts синхронізовано (${activeAlerts.length} активних).`);
  }

  await writeJson(OFFSET_FILE, offsetState);
  await writeJson(DELAY_REPORTS_FILE, delayReports);
  await writeJson(SUPPORT_MAP_FILE, supportMap);
  await writeJson(PENDING_PROMPTS_FILE, pendingPrompts);
  await writeJson(ADMIN_STATES_FILE, adminStates);
  await writeJson(KNOWN_USERS_FILE, knownUsers);
  await writeJson(PUBLIC_ALERTS_PATH, { updatedAt: new Date().toISOString(), items: alerts });

  return newDelayReports.length > 0 || updates.length > 0;
}

async function handleAlertsCommand(chatId, alertsArr, now) {
  const active = alertsArr.filter((a) => a.expiresAt > now);
  if (!active.length) {
    await sendMessage(chatId, '📋 <b>Активних оголошень немає.</b>', {
      reply_markup: { inline_keyboard: [[{ text: '🔙 В адмін-панель', callback_data: 'admin_panel' }]] }
    });
    return;
  }

  await sendMessage(chatId, `📋 <b>Активні оголошення (${active.length}):</b>`);
  for (const a of [...active].sort((x, y) => x.expiresAt - y.expiresAt)) {
    const minutesLeft = Math.max(0, Math.round((a.expiresAt - now) / 60));
    const kindLabel = a.kind ? KIND_LABELS[a.kind] || a.kind : 'Всі види';
    const scope = a.routeNumber.toLowerCase() === 'all' ? 'Загальне' : `Маршрут ${a.routeNumber}`;

    const text =
      `<b>${scope}</b> (${kindLabel})\n` +
      `${a.message}\n\n` +
      `⏱ Залишилось: ~${minutesLeft} хв | Джерело: ${a.source === 'auto' ? 'Авто' : 'Вручну'}`;

    await sendMessage(chatId, text, {
      reply_markup: { inline_keyboard: [[{ text: '🗑 Скасувати', callback_data: `cancel_alert:${a.id}` }]] }
    });
  }
}

async function main() {
  if (!BOT_TOKEN) {
    console.log('BOT_TOKEN не задано — пропускаю запуск.');
    return;
  }
  if (!ADMIN_CHAT_IDS.length) {
    console.log('ADMIN_CHAT_IDS не задано — нема кому надсилати сповіщення.');
  }

  const deadline = Date.now() + RUN_DURATION_MINUTES * 60 * 1000;
  let cycles = 0;

  console.log(`[bot] Старт чергування на ${RUN_DURATION_MINUTES} хв.`);

  while (Date.now() < deadline) {
    cycles += 1;
    let changed = false;
    try {
      changed = await processCycle();
    } catch (err) {
      console.error('[bot] Помилка в циклі обробки:', err);
      await new Promise((r) => setTimeout(r, 5000));
    }
    if (changed) {
      await gitCommitAndPush('chore: process telegram bot updates');
    }
  }

  console.log(`[bot] Завершено. Циклів: ${cycles}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
