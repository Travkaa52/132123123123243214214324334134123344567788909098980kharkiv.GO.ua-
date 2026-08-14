/**
 * supabase/functions/_shared/http.ts
 * ---------------------------------------------------------------------------
 * Дрібні хелпери для однакових JSON-відповідей і обробки помилок у всіх
 * Edge Functions. Навмисно без зовнішніх залежностей (zod тощо) — валідація
 * ручна й гранична, бо форми даних тут прості (id/kind/label-рядки).
 */
import { corsHeaders } from './cors.ts';

export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function jsonResponse(body: unknown, init: { status?: number; origin?: string | null; headers?: HeadersInit } = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders(init.origin ?? null),
      ...(init.headers ?? {})
    }
  });
}

export function errorResponse(err: unknown, origin: string | null): Response {
  if (err instanceof ApiError) {
    return jsonResponse({ error: err.code, message: err.message }, { status: err.status, origin });
  }
  // Ніколи не віддаємо сирий текст невідомої помилки клієнту (може містити
  // деталі запиту до БД) — тільки логуємо на сервері.
  console.error('unhandled error', err);
  return jsonResponse({ error: 'internal_error', message: 'Внутрішня помилка сервера' }, { status: 500, origin });
}

/** Обрізає й перевіряє рядок: не порожній, не довший за maxLen. */
export function requireString(value: unknown, field: string, maxLen = 200): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ApiError(400, 'validation_error', `Поле "${field}" обов'язкове`);
  }
  const trimmed = value.trim();
  if (trimmed.length > maxLen) {
    throw new ApiError(400, 'validation_error', `Поле "${field}" завдовге (макс. ${maxLen})`);
  }
  return trimmed;
}

export function optionalString(value: unknown, field: string, maxLen = 200): string | null {
  if (value === undefined || value === null) return null;
  return requireString(value, field, maxLen);
}

export function requireEnum<T extends string>(value: unknown, field: string, allowed: readonly T[]): T {
  const str = requireString(value, field, 32);
  if (!allowed.includes(str as T)) {
    throw new ApiError(400, 'validation_error', `Поле "${field}" має бути одним з: ${allowed.join(', ')}`);
  }
  return str as T;
}

export async function readJson(req: Request): Promise<unknown> {
  const text = await req.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new ApiError(400, 'invalid_json', 'Некоректний JSON у тілі запиту');
  }
}
