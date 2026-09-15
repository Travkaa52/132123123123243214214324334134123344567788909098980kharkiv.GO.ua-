import { useState, type FormEvent } from 'react';
import {
  Info,
  Award,
  FileText,
  LifeBuoy,
  Heart,
  Send,
  Loader2,
  Check,
  Copy,
  ExternalLink,
  ClipboardList,
  MessageCircle
} from 'lucide-react';
import { Modal } from '@/components/Modal';
import { useToastStore } from '@/store/useToastStore';
import { openSupportChat } from '@/lib/support';
import { BOT_USERNAME } from '@/lib/botConfig';

/**
 * НАЛАШТУВАННЯ, ЯКІ МОЖНА ЗАМІНИТИ НА СВОЇ:
 * - Юзернейм бота береться з lib/botConfig.ts (fallback вшито в код, можна
 *   перевизначити змінною VITE_TELEGRAM_BOT_USERNAME). Саму відправку
 *   повідомлення реалізує lib/support.ts — немає бекенду (GitHub Pages),
 *   тож повідомлення йде як deep link у чат з ботом, обробка на боці бота
 *   в bot/telegram_bot.py або scripts/process-telegram-bot.mjs.
 * - DONATION_CARD_NUMBER / DONATION_JAR_URL — реквізити для донатів.
 */
const TELEGRAM_BOT_URL = `https://t.me/${BOT_USERNAME}`;
const DONATION_CARD_NUMBER = '5355 5732 5047 6310';
const DONATION_JAR_URL = 'https://send.monobank.ua/jar/6S34HzcLMS';
// Google-форма зворотного зв'язку — запасний канал поруч із чатом у боті.
// Стилізувати вміст самої форми неможливо (кросдоменний iframe), тож
// оформлення app-стилю тримається на обгортці: рамка, скруглення, "скелетон"
// завантаження та адаптивна висота під контент модалки.
const SUPPORT_FORM_URL =
  'https://docs.google.com/forms/d/e/1FAIpQLScXW_IwNTAbXxJEj4RL86F7avqp5_otaGFUieC2poA8e0kgbA/viewform?embedded=true';


interface SimpleModalProps {
  open: boolean;
  onClose: () => void;
}

/* ---------------------------------------------------------------------- */
/* Про програму                                                           */
/* ---------------------------------------------------------------------- */
export function AboutAppModal({ open, onClose }: SimpleModalProps) {
  return (
    <Modal open={open} onClose={onClose} title="Про програму" icon={<Info className="h-4 w-4" />}>
      <div className="space-y-3 text-xs leading-relaxed text-ink-text">
        <p>
          <strong>Kharkiv GO</strong> — незалежний застосунок для навігації громадським транспортом Харкова: маршрути, розклади та статус метро в реальному часі.
        </p>
        <p className="text-ink-muted">
          Якщо помітили неточність у розкладі чи маршруті — скористайтеся кнопкою «Повідомити про
          затримку» на головній або напишіть у підтримку нижче.
        </p>
        <div className="grid grid-cols-2 gap-y-2 border-t border-border/40 pt-3 text-[11px]">
          <span className="font-medium text-ink-muted">Версія</span>
          <span className="text-right font-bold text-ink-text">v1.4.8.8 (Build 4.5.0.)</span>
          <span className="font-medium text-ink-muted">Карта</span>
          <span className="text-right font-bold text-ink-text">Leaflet / OpenStreetMap</span>
        </div>
      </div>
    </Modal>
  );
}

/* ---------------------------------------------------------------------- */
/* Оцінити застосунок                                                     */
/* ---------------------------------------------------------------------- */
export function RateAppModal({ open, onClose }: SimpleModalProps) {
  return (
    <Modal open={open} onClose={onClose} title="Оцінити застосунок" icon={<Award className="h-4 w-4" />}>
      <div className="space-y-4">
        <p className="text-xs leading-relaxed text-ink-muted">
          Дякуємо, що користуєтесь Kharkiv GO! Оцінка та відгук у Telegram Bot допомагають нам
          розвивати застосунок швидше.
        </p>
        <a
          href={TELEGRAM_BOT_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-3.5 text-xs font-extrabold text-primary-foreground shadow-md transition-all hover:bg-primary/90 active:scale-98"
        >
          <Send className="h-4 w-4" />
          <span>Залишити відгук у боті</span>
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>
    </Modal>
  );
}

/* ---------------------------------------------------------------------- */
/* Політика конфіденційності (Оновлена та жива версія)                    */
/* ---------------------------------------------------------------------- */
export function PrivacyPolicyModal({ open, onClose }: SimpleModalProps) {
  return (
    <Modal open={open} onClose={onClose} title="Політика конфіденційності" icon={<FileText className="h-4 w-4" />}>
      <div className="max-h-[55dvh] space-y-3 overflow-y-auto pr-2 text-xs leading-relaxed text-ink-text">
        <div className="space-y-2.5">
          <div className="rounded-xl border border-border/40 bg-surface-muted/30 p-3 space-y-1">
            <h4 className="font-extrabold text-ink-text flex items-center gap-1.5">
              <span>🎯</span> 1. Призначення застосунку
            </h4>
            <p className="text-ink-muted">
              <strong>Kharkiv GO</strong> є незалежним інформаційним сервісом для зручної навігації громадським транспортом Харкова.
            </p>
          </div>

          <div className="rounded-xl border border-border/40 bg-surface-muted/30 p-3 space-y-1">
            <h4 className="font-extrabold text-ink-text flex items-center gap-1.5">
              <span>🔍</span> 2. Достовірність інформації
            </h4>
            <p className="text-ink-muted">
              Ми оновлюємо дані за можливості, проте маршрути, схеми руху та зупинки можуть змінюватися у реальному часі без попереднього сповіщення.
            </p>
          </div>

          <div className="rounded-xl border border-border/40 bg-surface-muted/30 p-3 space-y-1">
            <h4 className="font-extrabold text-ink-text flex items-center gap-1.5">
              <span>🛡️</span> 3. Відповідальність користувача
            </h4>
            <p className="text-ink-muted mb-1">Ви самостійно приймаєте рішення щодо використання даних. Розробник не несе відповідальності за:</p>
            <ul className="list-disc pl-4 space-y-1 text-ink-muted">
              <li>Зміни маршрутів або затримки транспорту 🚍</li>
              <li>Скасування рейсів чи збої у відкритих джерелах ⏱️</li>
              <li>Тимчасову недоступність платформи 🔌</li>
            </ul>
          </div>

          <div className="rounded-xl border border-border/40 bg-surface-muted/30 p-3 space-y-1">
            <h4 className="font-extrabold text-ink-text flex items-center gap-1.5">
              <span>🌐</span> 4. Доступність сервісу
            </h4>
            <p className="text-ink-muted">
              Робота застосунку залежить від стабільності інтернет-мережі та зовнішніх сервісів. Можливі технічні перерви для оновлень.
            </p>
          </div>

          <div className="rounded-xl border border-border/40 bg-surface-muted/30 p-3 space-y-1">
            <h4 className="font-extrabold text-ink-text flex items-center gap-1.5">
              <span>📍</span> 5. Геолокація
            </h4>
            <p className="text-ink-muted">
              За вашою згодою застосунок використовує геолокацію для пошуку найближчих зупинок 🗺️ та відображення вас на мапі. Доступ можна вимкнути в налаштуваннях пристрою.
            </p>
          </div>

          <div className="rounded-xl border border-border/40 bg-surface-muted/30 p-3 space-y-1">
            <h4 className="font-extrabold text-ink-text flex items-center gap-1.5">
              <span>🔒</span> 6. Конфіденційність та дані
            </h4>
            <p className="text-ink-muted mb-1">Ми не збираємо приватних даних. На вашому пристрої локально зберігаються лише:</p>
            <ul className="list-disc pl-4 space-y-1 text-ink-muted">
              <li>Обрані маршрути та зупинки ⭐</li>
              <li>Налаштування інтерфейсу та теми оформлення ⚙️</li>
            </ul>
          </div>

          <div className="rounded-xl border border-border/40 bg-surface-muted/30 p-3 space-y-1">
            <h4 className="font-extrabold text-ink-text flex items-center gap-1.5">
              <span>🎨</span> 7. Інтелектуальна власність
            </h4>
            <p className="text-ink-muted">
              Програмний код, дизайн, логотипи та елементи інтерфейсу Kharkiv GO захищені авторським правом. Будь-яке копіювання чи модифікація без дозволу заборонені.
            </p>
          </div>

          <div className="rounded-xl border border-border/40 bg-surface-muted/30 p-3 space-y-1">
            <h4 className="font-extrabold text-ink-text flex items-center gap-1.5">
              <span>🔄</span> 8. Оновлення умов
            </h4>
            <p className="text-ink-muted">
              Ми залишаємо за собою право оновлювати функціонал, інтерфейс та правила користування для покращення сервісу.
            </p>
          </div>

          <div className="rounded-xl border border-border/40 bg-surface-muted/30 p-3 space-y-1">
            <h4 className="font-extrabold text-ink-text flex items-center gap-1.5">
              <span>⚠️</span> 9. Відмова від офіційного статусу
            </h4>
            <p className="text-ink-muted">
              Kharkiv GO — незалежний проєкт і не є офіційним додатком міського метрополітену чи комунальних підприємств. Інформація надається «як є».
            </p>
          </div>

          <div className="rounded-xl border border-border/40 bg-surface-muted/30 p-3 space-y-1">
            <h4 className="font-extrabold text-ink-text flex items-center gap-1.5">
              <span>📬</span> 10. Контакти
            </h4>
            <p className="text-ink-muted">
              Маєте пропозиції чи знайшли помилку? Звертайтеся до нас через кнопку «Зв'язок з підтримкою».
            </p>
          </div>
        </div>

        <div className="pt-2 text-center text-[10px] text-ink-muted/70">
          © Kharkiv GO
        </div>
      </div>
    </Modal>
  );
}

/* ---------------------------------------------------------------------- */
/* Зв'язок з підтримкою — надсилає повідомлення адміну через бота         */
/* ---------------------------------------------------------------------- */

type SupportTab = 'chat' | 'form';

export function SupportModal({ open, onClose }: SimpleModalProps) {
  const [tab, setTab] = useState<SupportTab>('chat');
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [formLoaded, setFormLoaded] = useState(false);
  const showToast = useToastStore((s) => s.show);

  const resetAndClose = () => {
    onClose();
    window.setTimeout(() => {
      setMessage('');
      setStatus('idle');
      setTab('chat');
      setFormLoaded(false);
    }, 200);
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!message.trim() || status === 'sending') return;

    setStatus('sending');
    const result = openSupportChat(message);

    if (result.ok) {
      setStatus('sent');
      showToast('Відкрили чат з ботом — натисніть "Надіслати", щоб підтвердити.', 'success');
      window.setTimeout(resetAndClose, 900);
    } else {
      setStatus('error');
      showToast('Функція ще не налаштована адміністратором. Спробуйте пізніше.', 'error');
    }
  };

  return (
    <Modal open={open} onClose={resetAndClose} title="Зв'язок з підтримкою" icon={<LifeBuoy className="h-4 w-4" />}>
      <div className="space-y-4">
        {/* Перемикач способу звернення — чат із ботом або Google-форма */}
        <div className="flex gap-1 rounded-2xl bg-surface-muted/40 p-1">
          <button
            type="button"
            onClick={() => setTab('chat')}
            className={`flex min-h-[38px] flex-1 items-center justify-center gap-1.5 rounded-xl text-[11px] font-extrabold transition-all ${
              tab === 'chat'
                ? 'bg-surface-raised text-ink-text shadow-sm'
                : 'text-ink-muted hover:text-ink-text'
            }`}
          >
            <MessageCircle className="h-3.5 w-3.5" />
            <span>Чат із ботом</span>
          </button>
          <button
            type="button"
            onClick={() => setTab('form')}
            className={`flex min-h-[38px] flex-1 items-center justify-center gap-1.5 rounded-xl text-[11px] font-extrabold transition-all ${
              tab === 'form'
                ? 'bg-surface-raised text-ink-text shadow-sm'
                : 'text-ink-muted hover:text-ink-text'
            }`}
          >
            <ClipboardList className="h-3.5 w-3.5" />
            <span>Форма</span>
          </button>
        </div>

        {tab === 'chat' ? (
          <form onSubmit={handleSubmit} className="space-y-3">
            <p className="text-xs leading-relaxed text-ink-muted">
              Опишіть проблему, ідею чи запитання — відкриється чат із ботом Kharkiv GO в Telegram із
              готовим текстом, залишиться тільки натиснути "Надіслати". Відповідь адміністратора
              прийде вам особистим повідомленням від бота.
            </p>

            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Ваше повідомлення..."
              rows={5}
              maxLength={1000}
              required
              className="w-full resize-none rounded-2xl border border-border/60 bg-surface-muted/40 p-3 text-xs font-medium text-ink-text outline-none transition-all placeholder:text-ink-muted/60 focus:border-primary/60 focus:ring-2 focus:ring-primary/10"
            />

            <button
              type="submit"
              disabled={!message.trim() || status === 'sending'}
              className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-3.5 text-xs font-extrabold text-primary-foreground shadow-md transition-all hover:bg-primary/90 active:scale-98 disabled:pointer-events-none disabled:opacity-50"
            >
              {status === 'sending' ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Відкриваємо чат...</span>
                </>
              ) : status === 'sent' ? (
                <>
                  <Check className="h-4 w-4" />
                  <span>Чат відкрито</span>
                </>
              ) : (
                <>
                  <Send className="h-4 w-4" />
                  <span>Написати в підтримку</span>
                </>
              )}
            </button>
          </form>
        ) : (
          <div className="space-y-2.5">
            <p className="text-xs leading-relaxed text-ink-muted">
              Або заповніть коротку форму зворотного зв'язку — вона теж потрапляє прямо до
              адміністратора Kharkiv GO.
            </p>

            <div className="relative overflow-hidden rounded-2xl border border-border/60 bg-surface-muted/40 shadow-inner">
              {!formLoaded && (
                <div className="flex h-[420px] w-full flex-col items-center justify-center gap-2.5">
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  <span className="text-[11px] font-medium text-ink-muted">Завантажуємо форму…</span>
                </div>
              )}
              <iframe
                src={SUPPORT_FORM_URL}
                title="Форма зворотного зв'язку Kharkiv GO"
                onLoad={() => setFormLoaded(true)}
                className={`w-full transition-opacity duration-300 ${formLoaded ? 'opacity-100' : 'absolute inset-0 h-0 opacity-0'}`}
                style={{ height: formLoaded ? '65dvh' : 0, colorScheme: 'light' }}
                frameBorder={0}
                marginHeight={0}
                marginWidth={0}
              >
                Завантаження…
              </iframe>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

/* ---------------------------------------------------------------------- */
/* Підтримати проект — донати                                             */
/* ---------------------------------------------------------------------- */
export function SupportProjectModal({ open, onClose }: SimpleModalProps) {
  const [copied, setCopied] = useState(false);
  const showToast = useToastStore((s) => s.show);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(DONATION_CARD_NUMBER.replace(/\s/g, ''));
      setCopied(true);
      showToast('Номер картки скопійовано', 'success');
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      showToast('Не вдалося скопіювати номер', 'error');
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Підтримати проект" icon={<Heart className="h-4 w-4" />}>
      <div className="space-y-4">
        <p className="text-xs leading-relaxed text-ink-muted">
          Kharkiv GO розвивається завдяки підтримці користувачів. Будь-яка сума допомагає
          оплачувати сервери та розвивати застосунок.
        </p>

        <div className="rounded-2xl border border-border/60 bg-surface-muted/40 p-4">
          <span className="text-[11px] font-bold uppercase tracking-wider text-ink-muted/80">
            Картка для донату
          </span>
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="text-sm font-extrabold tabular-nums text-ink-text">
              {DONATION_CARD_NUMBER}
            </span>
            <button
              onClick={handleCopy}
              aria-label="Скопіювати номер картки"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary transition-colors hover:bg-primary/20"
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <a
          href={DONATION_JAR_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-3.5 text-xs font-extrabold text-primary-foreground shadow-md transition-all hover:bg-primary/90 active:scale-98"
        >
          <Heart className="h-4 w-4" />
          <span>Відкрити банку monobank</span>
          <ExternalLink className="h-3.5 w-3.5" />
        </a>

        <p className="text-center text-[10px] text-ink-muted/70">Дякуємо за кожну гривню! 💙💛</p>
      </div>
    </Modal>
  );
}
