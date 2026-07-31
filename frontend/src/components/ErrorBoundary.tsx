import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Необов'язковий заголовок для конкретної секції (наприклад "Жива карта метро"). */
  label?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * Без цього компонента будь-яка помилка рендеру десь у дереві (наприклад, у
 * важкій сторінці "Живе метро") призводила до того, що React повністю
 * розмонтовував додаток, а користувач бачив просто чорний екран — тло
 * <body> у нас темне за замовчуванням (--color-bg у :root), і без жодного
 * UI поверх нього це виглядає як "все зламалось і нічого не видно".
 *
 * ErrorBoundary ловить помилку рендеру дочірніх компонентів і замість
 * порожнього чорного екрана показує зрозуміле повідомлення з кнопкою
 * "Спробувати ще раз" / "На головну".
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary]', this.props.label ?? '', error, info.componentStack);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  private handleGoHome = () => {
    this.setState({ hasError: false, error: null });
    window.location.href = import.meta.env.BASE_URL ?? '/';
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="fixed inset-0 z-[999] flex flex-col items-center justify-center gap-4 bg-bg px-6 text-center">
          <div className="text-4xl">😕</div>
          <div className="max-w-xs">
            <p className="text-base font-bold text-ink-text">
              {this.props.label ? `Не вдалося завантажити: ${this.props.label}` : 'Щось пішло не так'}
            </p>
            <p className="mt-1.5 text-sm text-ink-muted opacity-70">
              Сталася помилка під час відображення сторінки. Спробуйте ще раз або поверніться на головну.
            </p>
          </div>
          <div className="mt-2 flex items-center gap-2.5">
            <button
              type="button"
              onClick={this.handleReset}
              className="rounded-full bg-mint px-4 py-2 text-sm font-bold text-ink shadow-sm active:scale-95"
            >
              Спробувати ще раз
            </button>
            <button
              type="button"
              onClick={this.handleGoHome}
              className="rounded-full border border-border/20 bg-surface-soft px-4 py-2 text-sm font-medium text-ink-text active:scale-95"
            >
              На головну
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
