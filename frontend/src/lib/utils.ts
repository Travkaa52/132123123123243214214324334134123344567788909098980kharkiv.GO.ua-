import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * shadcn/ui стандартна утиліта для об'єднання класів з усуванням конфліктів.
 * Використовується у всіх UI-компонентах для чистого злиття стилів.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
