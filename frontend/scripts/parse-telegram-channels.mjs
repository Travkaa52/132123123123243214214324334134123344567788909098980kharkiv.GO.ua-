#!/usr/bin/env node
/**
 * Парсер публічних Telegram-каналів БЕЗ будь-якої авторизації.
 *
 * Як це працює: у Telegram кожен публічний канал має відкриту "прев'ю"
 * версію за адресою https://t.me/s/<username> — звичайну HTML-сторінку,
 * яку Telegram показує будь-кому без входу в акаунт (це те, що бачить
 * людина, коли переходить за посиланням на канал з браузера, не маючи
 * Telegram). Тому тут НЕМАЄ: api_id, api_hash, номера телефону, коду
 * підтвердження, пароля, сесії — просто звичайний HTTP-запит і розбір
 * готової HTML-сторінки. Це навмисно: скрипт призначений для запуску в
 * GitHub Actions за розкладом, де ніхто не може ввести код підтвердження
 * вручну, а користувачам застосунку взагалі не потрібно знати, що
 * сповіщення беруться саме так.
 *
 * Результат — plain JSON-файл (public/data/notifications.json), який потім
 * коміситься назад у репозиторій (див. .github/workflows/telegram-notifications.yml)
 * і роздається як звичайний статичний файл (GitHub Pages / raw.githubusercontent.com) —
 * окремий бекенд-сервер тримати не треба.
 *
 * ОСОБЛИВА ОБРОБКА @kh_metro (офіційний канал Харківського метрополітену):
 * повідомлення з цього каналу додатково класифікуються як "alert" (закриття
 * станцій/ліній, зупинка руху, повітряна тривога, збої) чи "info" (звичайні
 * новини), і в них розпізнаються згадані лінії/станції — щоб застосунок міг
 * підсвітити термінові оголошення окремо від загальної стрічки.
 */

import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

// Канал kh_metro підключено за замовчуванням — це основне джерело офіційних
// сповіщень про роботу метро для розділу "Живе метро", тому він не повинен
// залежати від того, чи налаштована змінна TELEGRAM_CHANNELS у репозиторії.
// Через TELEGRAM_CHANNELS можна або ДОДАТИ інші канали (вони приєднаються до
// kh_metro), або повністю замінити список, явно перелічивши потрібні канали
// (kh_metro можна прибрати, вказавши TELEGRAM_CHANNELS_REPLACE=1).
const DEFAULT_CHANNELS = ['kh_metro'];

const envChannels = (process.env.TELEGRAM_CHANNELS || '')
  .split(',')
  .map((c) => c.trim().replace(/^@/, ''))
  .filter(Boolean);

const REPLACE_DEFAULTS = process.env.TELEGRAM_CHANNELS_REPLACE === '1';
const CHANNELS = Array.from(
  new Set(REPLACE_DEFAULTS ? envChannels : [...DEFAULT_CHANNELS, ...envChannels])
);

const LIMIT_PER_CHANNEL = Number(process.env.NOTIFICATIONS_LIMIT || '15');
const OUTPUT_PATH = process.env.OUTPUT_PATH || 'public/data/notifications.json';

function decodeHtmlEntities(str) {
  return str
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Ключові слова, які видають ТЕРМІНОВЕ оголошення метрополітену: зупинку чи
 * обмеження руху, закриття станцій/вестибюлів, повітряну тривогу. Навмисно
 * ширший, ніж просто "аварія" — офіційний канал часто формулює це м'якше
 * ("тимчасово не курсують", "рух призупинено", "вхід/вихід зачинено").
 */
const METRO_ALERT_PATTERNS = [
  /рух\s+(поїзд|потяг)\S*.{0,40}(тимчасово\s+)?(призупин|зупинен)/i,
  /(тимчасово\s+)?не\s+курсу/i,
  /станці\S*.{0,40}(закрит|не\s+працю|обмежен)/i,
  /вестибюл\S*.{0,40}(закрит|зачинен)/i,
  /повітр\S*\s+тривог/i,
  /вхід\S*.{0,10}(та|і)?\s*вихід\S*.{0,40}(закрит|зачинен|обмежен)/i,
  /рух\S*.{0,20}відновлен/i,
  /обмеж\S*\s+рух/i,
  /аварі/i,
];

/** Розпізнає номер лінії метро (Л1/1-а лінія/Холодногірсько-Заводська тощо) у тексті, якщо є. */
const METRO_LINE_PATTERNS = [
  { id: 'route-metro-1', re: /(перш(а|ій)|1-?[аяi]|холодногірсько-?заводськ)/i },
  { id: 'route-metro-2', re: /(друг(а|ій)|2-?[аяi]|салтівськ)/i },
  { id: 'route-metro-3', re: /(трет(я|ій)|3-?[аяi]|олексіївськ)/i },
];

function classifyMetroMessage(text) {
  if (!text) return { kind: 'info', lineIds: [] };
  const isAlert = METRO_ALERT_PATTERNS.some((re) => re.test(text));
  const lineIds = METRO_LINE_PATTERNS.filter(({ re }) => re.test(text)).map(({ id }) => id);
  return { kind: isAlert ? 'alert' : 'info', lineIds };
}

/**
 * Дуже проста, але надійна для стабільної розмітки t.me/s/ регулярка:
 * розбиває сторінку на блоки повідомлень по data-post="username/id" і в
 * кожному блоці шукає текст і час.
 */
function parseChannelHtml(html, username) {
  const titleMatch = html.match(/<meta property="og:title" content="([^"]*)"/);
  const channelTitle = titleMatch ? decodeHtmlEntities(titleMatch[1]) : username;
  const isMetroChannel = username.toLowerCase() === 'kh_metro';

  const byId = new Map();
  const order = [];

  const blockRegex = /data-post="([^"/]+\/(\d+))"([\s\S]*?)(?=data-post="|$)/g;
  let match;

  while ((match = blockRegex.exec(html)) !== null) {
    const [, , id, block] = match;

    const textMatch = block.match(/<div class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/);
    const dateMatch = block.match(/<time[^>]*datetime="([^"]+)"/);
    if (!dateMatch) continue;

    const text = textMatch ? decodeHtmlEntities(textMatch[1]) : '';
    const hasMedia = /tgme_widget_message_(photo|video|document|voice|round)/.test(block);
    const isForwarded = /tgme_widget_message_forwarded_from/.test(block);
    const viewsMatch = block.match(/tgme_widget_message_views">([^<]+)</);

    if (!text && !hasMedia) continue;

    const base = {
      id: `${username}:${id}`,
      channel: username,
      channelTitle,
      text,
      date: new Date(dateMatch[1]).toISOString(),
      link: `https://t.me/${username}/${id}`,
      hasMedia,
      isForwarded,
      views: viewsMatch ? viewsMatch[1].trim() : null
    };

    // Класифікацію (alert/info + згадані лінії) рахуємо лише для офіційного
    // каналу метрополітену — для інших каналів це поле не має сенсу і не
    // заповнюється, щоб не видавати хибних спрацювань за чужими ключовими
    // словами.
    if (isMetroChannel) {
      const { kind, lineIds } = classifyMetroMessage(text);
      base.kind = kind;
      base.lineIds = lineIds;
    }

    // Альбоми (кілька фото в одному пості) Telegram рендерить як декілька
    // data-post-блоків з ОДНАКОВИМ id — лише один з них (як правило,
    // останній у розмітці) несе текст підпису, решта — "порожні" фото.
    // Раніше це призводило до буквальних дублікатів у стрічці й
    // конфліктних React-ключів; тепер зводимо блоки з одним id в один
    // запис, віддаючи перевагу тому, що має текст.
    if (byId.has(base.id)) {
      const existing = byId.get(base.id);
      if (!existing.text && base.text) {
        byId.set(base.id, { ...base, hasMedia: existing.hasMedia || base.hasMedia });
      } else {
        existing.hasMedia = existing.hasMedia || base.hasMedia;
      }
    } else {
      byId.set(base.id, base);
      order.push(base.id);
    }
  }

  const messages = order.map((id) => byId.get(id));
  return messages.slice(-LIMIT_PER_CHANNEL).reverse();
}

async function fetchChannel(username) {
  const url = `https://t.me/s/${username}`;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; KharkivGoBot/1.0; +https://github.com)' }
    });
    if (!res.ok) {
      console.error(`[${username}] HTTP ${res.status} — можливо, канал приватний або не існує`);
      return [];
    }
    const html = await res.text();
    return parseChannelHtml(html, username);
  } catch (err) {
    console.error(`[${username}] Помилка запиту:`, err.message);
    return [];
  }
}

async function main() {
  const all = [];
  for (const username of CHANNELS) {
    const messages = await fetchChannel(username);
    const alertCount = messages.filter((m) => m.kind === 'alert').length;
    console.log(
      `[${username}] знайдено повідомлень: ${messages.length}` +
        (alertCount > 0 ? ` (термінових: ${alertCount})` : '')
    );
    all.push(...messages);
  }

  all.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const payload = {
    updatedAt: new Date().toISOString(),
    items: all
  };

  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, JSON.stringify(payload, null, 2), 'utf-8');
  console.log(`Записано ${all.length} повідомлень у ${OUTPUT_PATH}`);
}

main();
