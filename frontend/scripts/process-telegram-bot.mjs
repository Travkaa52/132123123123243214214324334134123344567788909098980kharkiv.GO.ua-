#!/usr/bin/env node
/**
 * scripts/process-telegram-bot.mjs
 * ---------------------------------------------------------------------------
 * Ультра-зручний бот для KharkivGO — повністю на inline-кнопках.
 * Головне меню, довідка, PWA-інструкції, політика конфіденційності,
 * повноцінна адмін-панель (оголошення/статистика) — усе без вводу команд.
 *
 * Стійкість:
 *   - виклики Telegram API мають ретраї з експоненційним бекофом і чекають
 *     retry_after, якщо Telegram повернув 429;
 *   - файли стану пишуться атомарно (tmp-файл + rename);
 *   - обробка кожного окремого update обгорнута в try/catch — падіння на
 *     одному апдейті не ламає весь цикл і не губить offset (а отже не
 *     призводить до повторної обробки вже надісланих сповіщень);
 *   - проста антиспам-логіка (rate limit) на скарги/звернення від одного
 *     користувача.
 * ---------------------------------------------------------------------------
 */
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { replaceRouteAlerts, insertDelayReports } from './supabaseSync.mjs';

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
const APP_URL = process.env.APP_URL || 'https://kharkivgo.app'; // Посилання на вебзастосунок

// Антиспам: мінімальний інтервал (сек) між двома скаргами/зверненнями від
// ОДНОГО й того ж користувача — захищає від накрутки порогу оголошення
// затримки й від флуду в адмінський чат.
const USER_RATE_LIMIT_SECONDS = Number(process.env.USER_RATE_LIMIT_SECONDS || 20);

const RUNTIME_DIR = path.resolve('data-runtime');
const PUBLIC_ALERTS_PATH = path.resolve('public/data/route-alerts.json');

const OFFSET_FILE = path.join(RUNTIME_DIR, 'bot-offset.json');
const DELAY_REPORTS_FILE = path.join(RUNTIME_DIR, 'delay-reports.json');
const SUPPORT_MAP_FILE = path.join(RUNTIME_DIR, 'support-map.json');
const PENDING_PROMPTS_FILE = path.join(RUNTIME_DIR, 'pending-alert-prompts.json');
// Стан покрокових діалогів — і для адміна (створення оголошення), і для
// звичайного користувача (скарга на затримку: обрали вид транспорту, чекаємо
// номер маршруту). Один активний діалог на chat_id.
const CHAT_STATES_FILE = path.join(RUNTIME_DIR, 'chat-states.json');
const KNOWN_USERS_FILE = path.join(RUNTIME_DIR, 'known-users.json');
const RATE_LIMIT_FILE = path.join(RUNTIME_DIR, 'rate-limits.json');

const KNOWN_USERS_LIMIT = 20000;

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
  // Атомарний запис: спершу у тимчасовий файл поруч, тоді rename — так
  // навіть раптове переривання процесу посеред запису не лишить файл
  // напівзаписаним/пошкодженим.
  const tmpFile = `${file}.tmp-${randomBytes(4).toString('hex')}`;
  await writeFile(tmpFile, JSON.stringify(data, null, 2) + '\n', 'utf8');
  await rename(tmpFile, file);
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
      return; // Змін немає
    } catch {
      // Є зміни
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

// --- антиспам (rate limit) ---------------------------------------------------

/** true, якщо користувачу МОЖНА виконати дію (не в кулдауні) — і одразу
 * оновлює мітку часу. Окремий bucket на "delay" і "support", щоб одне не
 * блокувало інше. */
function checkAndTouchRateLimit(rateLimits, userId, bucket, now) {
  if (userId == null) return true;
  const key = `${bucket}:${userId}`;
  const last = rateLimits[key] || 0;
  if (now - last < USER_RATE_LIMIT_SECONDS) return false;
  rateLimits[key] = now;
  return true;
}

function pruneRateLimits(rateLimits, now) {
  const cutoff = now - Math.max(USER_RATE_LIMIT_SECONDS, 60) * 4;
  const pruned = {};
  for (const [key, ts] of Object.entries(rateLimits)) {
    if (ts >= cutoff) pruned[key] = ts;
  }
  return pruned;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// --- Telegram API Helpers ---

const API_BASE = `https://api.telegram.org/bot${BOT_TOKEN}`;

/** POST до Bot API з експоненційним бекофом на мережеві збої та повагою до
 * 429 Too Many Requests. getUpdates навмисно НЕ ретраїться тут (він і так
 * у зовнішньому циклі опитування). */
async function tg(method, payload, { retries = 3 } = {}) {
  let delayMs = 1000;
  let lastError;

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    let data;
    try {
      const res = await fetch(`${API_BASE}/${method}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      data = await res.json();
    } catch (err) {
      lastError = err;
      if (attempt < retries && method !== 'getUpdates') {
        console.warn(`[bot] Мережева помилка у ${method} (спроба ${attempt}/${retries}): ${err.message} — повтор через ${delayMs}мс`);
        await sleep(delayMs);
        delayMs *= 2;
        continue;
      }
      console.error(`[bot] Мережева помилка у ${method}:`, err.message);
      return { ok: false, description: err.message };
    }

    if (!data.ok) {
      if (data.error_code === 429) {
        const retryAfter = data.parameters?.retry_after ?? Math.ceil(delayMs / 1000);
        console.warn(`[bot] Rate limit від Telegram у ${method}, чекаю ${retryAfter}с.`);
        await sleep(retryAfter * 1000 + 500);
        if (attempt < retries) continue;
      }
      console.error(`[bot] Telegram API помилка у ${method}:`, data.description);
    }
    return data;
  }
  return { ok: false, description: lastError?.message };
}

function sendMessage(chatId, text, extra = {}) {
  return tg('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', ...extra });
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

function escapeHtml(text) {
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const DELAY_TAG_RE = /^#delay:([a-z_]+):([^\s#]+)#\s*/;
const SUPPORT_TAG_RE = /^#support#\s*/;

async function registerCommands() {
  await tg('setMyCommands', {
    commands: [
      { command: 'start', description: 'Почати / головне меню' },
      { command: 'help', description: 'Довідка' }
    ]
  });
  for (const adminId of ADMIN_CHAT_IDS) {
    await tg('setMyCommands', {
      commands: [
        { command: 'start', description: 'Головне меню' },
        { command: 'admin', description: 'Панель адміністратора' },
        { command: 'help', description: 'Довідка' }
      ],
      scope: { type: 'chat', chat_id: adminId }
    });
  }
}

// --- Клавіатури Меню ---

function getMainMenuKeyboard(isAdmin = false) {
  const keyboard = [
    [
      { text: '🚨 Повідомити про затримку', callback_data: 'user_report_delay' },
      { text: '💬 Підтримка', callback_data: 'user_support_info' }
    ],
    [
      { text: 'ℹ️ Про KharkivGO', callback_data: 'user_about_menu' }
    ]
  ];

  if (isAdmin) {
    keyboard.push([{ text: '⚙️ Адмін-панель', callback_data: 'admin_panel' }]);
  }

  return { inline_keyboard: keyboard };
}

function getAboutMenuKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: '📲 Як встановити', callback_data: 'about_install' },
        { text: '📖 Як користуватися', callback_data: 'about_how_to_use' }
      ],
      [
        { text: '🔒 Політика конфіденційності', callback_data: 'about_privacy' }
      ],
      [
        { text: '🌐 Відкрити застосунок', url: APP_URL }
      ],
      [
        { text: '🏠 Головне меню', callback_data: 'go_main_menu' }
      ]
    ]
  };
}

function getAdminPanelKeyboard() {
  return {
    inline_keyboard: [
      [{ text: '📋 Активні оголошення', callback_data: 'admin_view_alerts' }],
      [{ text: '📢 Створити оголошення / затримку', callback_data: 'admin_create_alert_start' }],
      [{ text: '📊 Статистика скарг', callback_data: 'admin_stats' }],
      [{ text: '🏠 Головне меню', callback_data: 'go_main_menu' }]
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

function helpText(isAdmin) {
  if (isAdmin) {
    return (
      'ℹ️ <b>Довідка — панель адміна KharkivGO</b>\n\n' +
      '⚙️ <b>Адмін-панель</b> — усе одним меню:\n' +
      '• 📋 Активні оголошення — список зі скасуванням в 1 тап\n' +
      '• 📢 Створити оголошення / затримку — оберіть вид транспорту, потім надішліть ' +
      '<code>[номер] [текст]</code> (або <code>all [текст]</code> для загального)\n' +
      '• 📊 Статистика скарг — короткий дашборд\n\n' +
      '💬 Reply на переслане звернення користувача — відповідь піде йому напряму.\n' +
      'Inline-кнопка під авто-запитом «X користувачів поскаржились» — підтвердити оголошення в 1 тап.'
    );
  }
  return (
    'ℹ️ <b>Довідка KharkivGO Bot</b>\n\n' +
    '🚨 <b>Повідомити про затримку</b> — оберіть вид транспорту, потім одним повідомленням ' +
    'надішліть номер маршруту (і, за бажанням, короткий коментар).\n' +
    '💬 <b>Підтримка</b> — просто напишіть повідомлення, ми відповімо прямо в цьому чаті.\n' +
    'ℹ️ <b>Про KharkivGO</b> — як встановити застосунок, як ним користуватись, політика конфіденційності.'
  );
}

// --- Основний цикл обробки ---

async function processCycle() {
  const offsetState = await readJson(OFFSET_FILE, { lastUpdateId: 0 });
  let delayReports = await readJson(DELAY_REPORTS_FILE, []);
  let supportMap = await readJson(SUPPORT_MAP_FILE, []);
  let pendingPrompts = await readJson(PENDING_PROMPTS_FILE, []);
  let chatStates = await readJson(CHAT_STATES_FILE, {});
  let knownUsers = await readJson(KNOWN_USERS_FILE, []);
  let rateLimits = await readJson(RATE_LIMIT_FILE, {});
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
    // offset просувається одразу, а обробка конкретного update обгорнута в
    // try/catch нижче — падіння на одному апдейті не має ламати весь цикл
    // (і, головне, не має "губити" вже занесений у offset прогрес, інакше
    // Telegram надішле той самий апдейт повторно і скарга/сповіщення
    // продублюється).
    offsetState.lastUpdateId = Math.max(offsetState.lastUpdateId, update.update_id);

    try {
      await handleUpdate(update, {
        now,
        alerts,
        delayReports,
        supportMap,
        pendingPrompts,
        chatStates,
        knownUsers,
        rateLimits
      });
    } catch (err) {
      console.error(`[bot] Помилка обробки update_id=${update.update_id}:`, err?.stack || err);
    }
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
  rateLimits = pruneRateLimits(rateLimits, now);
  if (knownUsers.length > KNOWN_USERS_LIMIT) {
    knownUsers = knownUsers.slice(-KNOWN_USERS_LIMIT);
  }

  const activeAlerts = alerts.filter((a) => a.expiresAt > now);
  if (await replaceRouteAlerts(activeAlerts)) {
    console.log(`[bot] Supabase: route_alerts синхронізовано (${activeAlerts.length} активних).`);
  }

  await writeJson(OFFSET_FILE, offsetState);
  await writeJson(DELAY_REPORTS_FILE, delayReports);
  await writeJson(SUPPORT_MAP_FILE, supportMap);
  await writeJson(PENDING_PROMPTS_FILE, pendingPrompts);
  await writeJson(CHAT_STATES_FILE, chatStates);
  await writeJson(KNOWN_USERS_FILE, knownUsers);
  await writeJson(RATE_LIMIT_FILE, rateLimits);
  await writeJson(PUBLIC_ALERTS_PATH, { updatedAt: new Date().toISOString(), items: alerts });

  return newDelayReports.length > 0 || updates.length > 0;
}

/** Обробляє один update (message або callback_query). Мутує передані-по-
 * посиланню масиви/об'єкти стану (alerts, delayReports, ...) на місці. */
async function handleUpdate(update, state) {
  const { now, alerts, delayReports, supportMap, pendingPrompts, chatStates, knownUsers, rateLimits } = state;

  // --- ОБРОБКА КНОПОК (Callback Queries) ---
  if (update.callback_query) {
    const cq = update.callback_query;
    const chatId = cq.message.chat.id;
    const data = cq.data || '';

    await tg('answerCallbackQuery', { callback_query_id: cq.id });

    // Навігаційні дії
    if (data === 'go_main_menu') {
      delete chatStates[chatId];
      await editMessageText(
        chatId,
        cq.message.message_id,
        '👋 <b>Головне меню KharkivGO</b>\n\nОберіть потрібну дію за допомогою кнопок нижче:',
        { reply_markup: getMainMenuKeyboard(isAdminChat(chatId)) }
      );
      return;
    }

    // Підменю "Про KharkivGO"
    if (data === 'user_about_menu') {
      await editMessageText(
        chatId,
        cq.message.message_id,
        '💙💛 <b>Про застосунок KharkivGO</b>\n\n' +
        'KharkivGO — це інтерактивний міський сервіс для зручного відстеження громадського транспорту Харкова у реальному часі.\n\n' +
        'Оберіть потрібний розділ для детальної інформації:',
        { reply_markup: getAboutMenuKeyboard() }
      );
      return;
    }

    // Інструкція Встановлення
    if (data === 'about_install') {
      await editMessageText(
        chatId,
        cq.message.message_id,
        '📲 <b>Як встановити KharkivGO на смартфон?</b>\n\n' +
        'KharkivGO працює як сучасний Progressive Web App (PWA) — його не потрібно шукати в App Store чи Play Market, він встановлюється за пару секунд прямо з браузера!\n\n' +
        '🍏 <b>Для iOS (iPhone / iPad):</b>\n' +
        '1. Відкрийте сайт застосунку в браузері <b>Safari</b>.\n' +
        '2. Натисніть кнопку <b>«Поділитися»</b> (квадрат зі стрілкою внизу екрана).\n' +
        '3. Прокрутіть список нижче та оберіть <b>«На початковий екран»</b>.\n' +
        '4. Натисніть «Додати» у верхньому правому кутку.\n\n' +
        '🤖 <b>Для Android:</b>\n' +
        '1. Відкрийте сайт у браузері <b>Google Chrome</b>.\n' +
        '2. Натисніть на <b>три крапки</b> у верхньому правому кутку.\n' +
        '3. Оберіть <b>«Встановити додаток»</b> або <b>«Додати на головний екран»</b>.\n' +
        '4. Підтвердьте встановлення.',
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: '🔙 Назад до Про KharkivGO', callback_data: 'user_about_menu' }],
              [{ text: '🏠 Головне меню', callback_data: 'go_main_menu' }]
            ]
          }
        }
      );
      return;
    }

    // Інструкція Використання
    if (data === 'about_how_to_use') {
      await editMessageText(
        chatId,
        cq.message.message_id,
        '📖 <b>Як користуватися KharkivGO?</b>\n\n' +
        '🗺 <b>1. Карта транспорту:</b>\n' +
        'На карті в реальному часі відображається рух автобусів, тролейбусів, трамваїв та метро. Натисніть на маркер транспорту, щоб побачити його швидкість та наступну зупинку.\n\n' +
        '🔍 <b>2. Пошук та Маршрути:</b>\n' +
        'Введіть номер потрібного маршруту або назву зупинки у верхньому полі пошуку. Ви зможете переглянути повний трафік та схему руху.\n\n' +
        '🚨 <b>3. Сповіщення та Затримки:</b>\n' +
        'Якщо ви чекаєте на транспорт, а його немає — скористайтеся кнопкою <b>«🚨 Повідомити про затримку»</b> у цьому боті. Якщо декілька пасажирів заявлять про затримку, система автоматично сповістить усіх користувачів!',
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: '🔙 Назад до Про KharkivGO', callback_data: 'user_about_menu' }],
              [{ text: '🏠 Головне меню', callback_data: 'go_main_menu' }]
            ]
          }
        }
      );
      return;
    }

    // Політика Конфіденційності
    if (data === 'about_privacy') {
      await editMessageText(
        chatId,
        cq.message.message_id,
        '🔒 <b>Політика конфіденційності KharkivGO</b>\n\n' +
        'Ми поважаємо ваші приватні дані та дбаємо про безпеку:\n\n' +
        '• <b>Збір даних у Telegram:</b> Бот фіксує ваш Telegram ID та імя профілю виключно для зворотного зв’язку через службу підтримки та для запобігання спаму скаргами.\n' +
        '• <b>Геолокація:</b> Вебзастосунок запитує доступ до вашого розташування тільки для показу найближчих зупинок. Ми НЕ зберігаємо та НЕ передаємо вашу геолокацію третім особам.\n' +
        '• <b>Безпека:</b> Усі дані передаються через захищене шифроване з’єднання (HTTPS/SSL).\n' +
        '• <b>Реклама:</b> Ми не використовуємо ваші особисті дані для таргет-реклами.',
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: '🔙 Назад до Про KharkivGO', callback_data: 'user_about_menu' }],
              [{ text: '🏠 Головне меню', callback_data: 'go_main_menu' }]
            ]
          }
        }
      );
      return;
    }

    if (data === 'user_support_info') {
      chatStates[chatId] = { step: 'awaiting_support_text' };
      await editMessageText(
        chatId,
        cq.message.message_id,
        '💬 <b>Служба підтримки KharkivGO</b>\n\n' +
        'Просто напишіть будь-яке запитання, пропозицію чи скаргу прямим повідомленням у цей чат — ми отримаємо його і відповімо вам сюди ж!',
        { reply_markup: { inline_keyboard: [[{ text: '🔙 Скасувати', callback_data: 'go_main_menu' }]] } }
      );
      return;
    }

    if (data === 'user_report_delay') {
      await editMessageText(
        chatId,
        cq.message.message_id,
        '🚨 <b>Повідомити про затримку</b>\n\nОберіть вид транспорту:',
        { reply_markup: getSelectKindKeyboard('user_delay_kind') }
      );
      return;
    }

    if (data.startsWith('user_delay_kind:')) {
      const kindRaw = data.split(':')[1];
      const kind = kindRaw === 'all' ? null : kindRaw;
      const kindLabel = kind ? KIND_LABELS[kind] : 'будь-який вид транспорту';
      // Зберігаємо крок діалогу — наступне звичайне повідомлення від цього
      // чату буде розпізнано як номер маршруту (+ коментар), а не як
      // звернення в підтримку.
      chatStates[chatId] = { step: 'awaiting_delay_report', kind };
      await editMessageText(
        chatId,
        cq.message.message_id,
        `🚨 <b>Скарга на затримку (${kindLabel})</b>\n\n` +
        `Напишіть номер маршруту та, за бажанням, коротко опишіть ситуацію одним повідомленням.\n\n` +
        `<i>Приклад: 27 затримується на 15 хв біля станції метро</i>`,
        { reply_markup: { inline_keyboard: [[{ text: '🔙 Скасувати', callback_data: 'go_main_menu' }]] } }
      );
      return;
    }

    // --- АДМІН-ФУНКЦІОНАЛ ---
    if (isAdminChat(chatId)) {
      if (data === 'admin_panel') {
        delete chatStates[chatId];
        await editMessageText(chatId, cq.message.message_id, '⚙️ <b>Панель адміністратора KharkivGO</b>', {
          reply_markup: getAdminPanelKeyboard()
        });
        return;
      }

      if (data === 'admin_view_alerts') {
        await handleAlertsCommand(chatId, alerts, now);
        return;
      }

      if (data === 'admin_stats') {
        const windowStart = now - DELAY_REPORT_WINDOW_MINUTES * 60;
        const recentReports = delayReports.filter((r) => r.createdAt >= windowStart);
        const activeAlerts = alerts.filter((a) => a.expiresAt > now);
        const byRoute = new Map();
        for (const r of recentReports) {
          const key = `${r.routeNumber} (${KIND_LABELS[r.kind] || '—'})`;
          byRoute.set(key, (byRoute.get(key) || 0) + 1);
        }
        const topRoutes = [...byRoute.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
        const topLines = topRoutes.length
          ? topRoutes.map(([route, count]) => `  • ${route}: ${count}`).join('\n')
          : '  —';

        await editMessageText(
          chatId,
          cq.message.message_id,
          `📊 <b>Статистика скарг за останні ${DELAY_REPORT_WINDOW_MINUTES} хв:</b>\n\n` +
          `🟢 Активних оголошень: <b>${activeAlerts.length}</b>\n` +
          `📨 Всього отримано скарг: <b>${recentReports.length}</b>\n` +
          `👤 Унікальних дописувачів: <b>${new Set(recentReports.map((r) => r.userId)).size}</b>\n` +
          `⏳ У черзі на підтвердження: <b>${pendingPrompts.length}</b>\n\n` +
          `<b>Топ маршрутів за скаргами:</b>\n${topLines}\n\n` +
          `<i>Поріг авто-сповіщення: ${DELAY_REPORT_THRESHOLD} скарг на маршрут.</i>`,
          { reply_markup: { inline_keyboard: [[{ text: '🔙 В адмін-панель', callback_data: 'admin_panel' }]] } }
        );
        return;
      }

      if (data === 'admin_create_alert_start') {
        await editMessageText(chatId, cq.message.message_id, '📢 <b>Оберіть вид транспорту для оголошення:</b>', {
          reply_markup: getSelectKindKeyboard('admin_alert_kind')
        });
        return;
      }

      if (data.startsWith('admin_alert_kind:')) {
        const kind = data.split(':')[1];
        chatStates[chatId] = { step: 'awaiting_alert_text', kind: kind === 'all' ? null : kind };
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
        return;
      }

      if (data.startsWith('cancel_alert:')) {
        const alertId = Number(data.split(':')[1]);
        const before = alerts.length;
        const removed = alerts.find((a) => a.id === alertId);
        const survivors = alerts.filter((a) => a.id !== alertId);
        alerts.length = 0;
        alerts.push(...survivors);
        const didRemove = alerts.length !== before;

        await editMessageText(
          chatId,
          cq.message.message_id,
          didRemove
            ? `🗑 <b>Оголошення скасовано!</b>\n<b>Маршрут:</b> ${escapeHtml(removed?.routeNumber || 'Загальне')}`
            : '❌ Оголошення вже скасоване або застаріло.',
          { reply_markup: { inline_keyboard: [[{ text: '⚙️ В адмін-панель', callback_data: 'admin_panel' }]] } }
        );
        return;
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

        const survivors = pendingPrompts.filter((p) => !(p.routeNumber === routeNumber && p.kind === kind));
        pendingPrompts.length = 0;
        pendingPrompts.push(...survivors);

        await editMessageText(
          chatId,
          cq.message.message_id,
          `✅ <b>Оголошення підтверджено та опубліковано у застосунку!</b>\nМаршрут: ${escapeHtml(routeNumber)} (активне ${DELAY_ALERT_DURATION_HOURS} год.)`,
          {
            reply_markup: {
              inline_keyboard: [[{ text: '🗑 Скасувати достроково', callback_data: `cancel_alert:${newAlertId}` }]]
            }
          }
        );
        return;
      }
    }

    return;
  }

  // --- ОБРОБКА ЗВИЧАЙНИХ ПОВІДОМЛЕНЬ ---
  const message = update.message;
  if (!message || !message.text) return;

  const chatId = message.chat.id;
  const from = message.from || {};
  const admin = isAdminChat(chatId);
  const text = message.text;

  // Команда /start (Перший та повторний запуски)
  if (text.startsWith('/start')) {
    delete chatStates[chatId];
    const isNew = !knownUsers.includes(chatId);
    if (isNew) knownUsers.push(chatId);

    const welcomeText = isNew
      ? `👋 <b>Ласкаво просимо до KharkivGO, ${escapeHtml(from.first_name || 'пасажире')}!</b>\n\n` +
        `Це офіційний бот для відстеження міського транспорту Харкова.\n\n` +
        `<b>Що тут можна робити:</b>\n` +
        `• 🚨 <b>Повідомити про затримку:</b> якщо транспорт затримується, оперативно передайте це диспетчеру.\n` +
        `• 💬 <b>Зв'язатися з підтримкою:</b> просто напишіть повідомлення сюди, і ми відповімо.\n` +
        `• 📲 <b>Інструкції та Довідка:</b> дізнайтеся, як встановити PWA-додаток та користуватися картою.\n\n` +
        `Скористайтеся кнопками нижче:`
      : `👋 <b>З поверненням, ${escapeHtml(from.first_name || 'пасажире')}!</b>\n\nОберіть потрібний розділ меню:`;

    await sendMessage(chatId, welcomeText, { reply_markup: getMainMenuKeyboard(admin) });
    return;
  }

  if (text.startsWith('/help')) {
    delete chatStates[chatId];
    await sendMessage(chatId, helpText(admin), {
      reply_markup: admin ? getAdminPanelKeyboard() : getMainMenuKeyboard(false)
    });
    return;
  }

  // Команда /admin
  if (text.startsWith('/admin') && admin) {
    delete chatStates[chatId];
    await sendMessage(chatId, '⚙️ <b>Панель адміністратора KharkivGO</b>', {
      reply_markup: getAdminPanelKeyboard()
    });
    return;
  }

  // Reply Адміна у підтримці (перевіряємо ДО кроків діалогу — Reply має пріоритет)
  if (admin && message.reply_to_message) {
    const mapping = supportMap.find(
      (m) => m.chatId === chatId && m.messageId === message.reply_to_message.message_id
    );
    if (mapping) {
      await sendMessage(mapping.userId, `💬 <b>Відповідь підтримки KharkivGO:</b>\n\n${escapeHtml(text)}`);
      await sendMessage(chatId, '✅ <b>Відповідь відправлено користувачу!</b>', {
        reply_to_message_id: message.message_id
      });
    } else {
      await sendMessage(chatId, '⚠️ Оригінальне звернення не знайдено.');
    }
    return;
  }

  // --- Введення тексту адміном: створення оголошення ---
  if (admin && chatStates[chatId]?.step === 'awaiting_alert_text') {
    const { kind } = chatStates[chatId];
    delete chatStates[chatId];

    const parts = text.trim().split(/\s+/);
    const routeNumber = parts[0];
    const alertText = parts.slice(1).join(' ');

    if (!routeNumber || !alertText) {
      await sendMessage(chatId, '❌ <b>Помилка формату!</b> Потрібно: <code>[номер] [текст]</code>. Спробуйте ще раз з адмін-панелі.', {
        reply_markup: getAdminPanelKeyboard()
      });
      return;
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

    await sendMessage(
      chatId,
      `✅ <b>Оголошення опубліковано!</b>\n\n<b>Маршрут:</b> ${escapeHtml(routeNumber)}\n<b>Текст:</b> ${escapeHtml(alertText)}`,
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: '🗑 Скасувати достроково', callback_data: `cancel_alert:${alertId}` }],
            [{ text: '⚙️ В адмін-панель', callback_data: 'admin_panel' }]
          ]
        }
      }
    );
    return;
  }

  if (admin) return; // адмін пише щось поза діалогом і не Reply — ігноруємо

  // --- Продовження діалогу "скарга на затримку" (кнопки вибору виду вже пройдено) ---
  if (chatStates[chatId]?.step === 'awaiting_delay_report') {
    const { kind } = chatStates[chatId];
    delete chatStates[chatId];

    if (!checkAndTouchRateLimit(rateLimits, from.id, 'delay', now)) {
      await sendMessage(chatId, '⏳ Зачекайте трохи перед наступною скаргою — попередню вже надіслано.', {
        reply_markup: getMainMenuKeyboard(false)
      });
      return;
    }

    const parts = text.trim().split(/\s+/);
    const routeNumber = parts[0];
    const comment = parts.slice(1).join(' ');

    if (!routeNumber) {
      await sendMessage(chatId, '❌ Будь ласка, вкажіть номер маршруту (наприклад: 27).', {
        reply_markup: { inline_keyboard: [[{ text: '🔙 Скасувати', callback_data: 'go_main_menu' }]] }
      });
      return;
    }

    delayReports.push({
      userId: from.id,
      username: from.username || null,
      kind,
      routeNumber,
      comment,
      createdAt: now
    });

    const kindLabel = kind ? KIND_LABELS[kind] : 'Транспорт (будь-який вид)';
    let adminNotice =
      `🚨 <b>Нова скарга на затримку!</b>\n\n<b>Маршрут:</b> ${escapeHtml(routeNumber)} (${kindLabel})\n` +
      `<b>Від:</b> ${userLabel(from.id, from.username, from.first_name)}`;
    if (comment) adminNotice += `\n<b>Коментар:</b> ${escapeHtml(comment)}`;

    for (const adminId of ADMIN_CHAT_IDS) {
      await sendMessage(adminId, adminNotice);
    }
    await sendMessage(chatId, '✅ <b>Дякуємо!</b> Скаргу на затримку передано диспетчеру.', {
      reply_markup: getMainMenuKeyboard(false)
    });
    return;
  }

  // Обробка скарги з мініапки (прихований тег "#delay:kind:route#")
  const delayMatch = text.match(DELAY_TAG_RE);
  if (delayMatch) {
    if (!checkAndTouchRateLimit(rateLimits, from.id, 'delay', now)) {
      await sendMessage(chatId, '⏳ Зачекайте трохи перед наступною скаргою — попередню вже надіслано.', {
        reply_markup: getMainMenuKeyboard(false)
      });
      return;
    }

    const [, kindRaw, routeNumber] = delayMatch;
    const kind = kindRaw === '_' ? null : kindRaw;
    const comment = text.replace(DELAY_TAG_RE, '').trim();

    delayReports.push({
      userId: from.id,
      username: from.username || null,
      kind,
      routeNumber,
      comment,
      createdAt: now
    });

    const kindLabel = KIND_LABELS[kind] || 'Транспорт';
    let adminNotice = `🚨 <b>Нова скарга на затримку!</b>\n\n<b>Маршрут:</b> ${escapeHtml(routeNumber)} (${kindLabel})\n<b>Від:</b> ${userLabel(from.id, from.username, from.first_name)}`;
    if (comment) adminNotice += `\n<b>Коментар:</b> ${escapeHtml(comment)}`;

    for (const adminId of ADMIN_CHAT_IDS) {
      await sendMessage(adminId, adminNotice);
    }
    await sendMessage(chatId, '✅ <b>Дякуємо!</b> Скаргу на затримку передано диспетчеру.', {
      reply_markup: getMainMenuKeyboard(false)
    });
    return;
  }

  // Звичайне звернення в підтримку
  const supportText = text.replace(SUPPORT_TAG_RE, '').trim();
  if (!supportText) return;

  if (!checkAndTouchRateLimit(rateLimits, from.id, 'support', now)) {
    await sendMessage(chatId, '⏳ Ваше попереднє звернення вже в черзі — зачекайте відповіді, будь ласка.', {
      reply_markup: getMainMenuKeyboard(false)
    });
    return;
  }

  delete chatStates[chatId]; // якщо були в awaiting_support_text — закриваємо крок

  const header =
    `💬 <b>Нове звернення в підтримку</b>\n` +
    `<b>Від:</b> ${userLabel(from.id, from.username, from.first_name)}\n\n` +
    `${escapeHtml(supportText)}\n\n` +
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
    const scope = String(a.routeNumber).toLowerCase() === 'all' ? 'Загальне' : `Маршрут ${escapeHtml(a.routeNumber)}`;

    const text =
      `<b>${scope}</b> (${kindLabel})\n` +
      `${escapeHtml(a.message)}\n\n` +
      `⏱ Залишилось: ~${minutesLeft} хв | Джерело: ${a.source === 'auto' ? 'Авто' : 'Вручну'}`;

    await sendMessage(chatId, text, {
      reply_markup: { inline_keyboard: [[{ text: '🗑 Скасувати', callback_data: `cancel_alert:${a.id}` }]] }
    });
  }
  await sendMessage(chatId, '⬇️', { reply_markup: { inline_keyboard: [[{ text: '🔙 В адмін-панель', callback_data: 'admin_panel' }]] } });
}

let shutdownRequested = false;
function requestShutdown(signal) {
  console.log(`[bot] Отримано ${signal} — завершую поточний цикл і виходжу.`);
  shutdownRequested = true;
}
process.on('SIGINT', () => requestShutdown('SIGINT'));
process.on('SIGTERM', () => requestShutdown('SIGTERM'));

async function main() {
  if (!BOT_TOKEN) {
    console.log('BOT_TOKEN не задано — пропускаю запуск.');
    return;
  }
  if (!ADMIN_CHAT_IDS.length) {
    console.log('ADMIN_CHAT_IDS не задано — нема кому надсилати сповіщення.');
  }

  await registerCommands();

  const deadline = Date.now() + RUN_DURATION_MINUTES * 60 * 1000;
  let cycles = 0;

  console.log(`[bot] Старт чергування на ${RUN_DURATION_MINUTES} хв.`);

  while (Date.now() < deadline && !shutdownRequested) {
    cycles += 1;
    let changed = false;
    try {
      changed = await processCycle();
    } catch (err) {
      console.error('[bot] Помилка в циклі обробки:', err);
      await sleep(5000);
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
