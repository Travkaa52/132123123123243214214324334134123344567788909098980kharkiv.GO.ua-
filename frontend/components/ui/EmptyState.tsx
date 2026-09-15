import { type ReactNode } from 'react';
import { Emblem } from './Emblem';

interface EmptyStateProps {
  title: string;
  description?: string;
  action?: ReactNode;
}

/** Єдиний порожній стан (немає обраного, немає історії, немає результатів пошуку тощо). */
export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-8 py-16 text-center animate-fade-in">
      <Emblem size={56} className="opacity-40" />
      <p className="text-title text-ink-text">{title}</p>
      {description && <p className="text-body-sm text-ink-muted">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
