import { getTelegramWebApp } from '@/lib/telegram';

/** true, якщо задано VITE_API_BASE_URL і ми маємо підписаний Telegram initData. */
export function isBackendAvailable(): boolean {
  return Boolean(import.meta.env.VITE_API_BASE_URL) && Boolean(getTelegramWebApp()?.initData);
}

async function request<T>(path: string, init?: RequestInit): Promise<T | null> {
  const baseUrl = import.meta.env.VITE_API_BASE_URL;
  const initData = getTelegramWebApp()?.initData;

  if (!baseUrl || !initData) {
    return null;
  }

  try {
    const response = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        'X-Telegram-Init-Data': initData,
        ...(init?.headers ?? {})
      }
    });

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as T;
  } catch {
    return null;
  }
}

export const apiClient = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) => request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' })
};
