export type PushPermissionResult = 'granted' | 'denied' | 'unsupported';

/**
 * Єдина точка запиту дозволу на push-сповіщення в застосунку. Викликається
 * у відповідь на явну дію користувача (збереження нагадування, перемикач
 * у налаштуваннях) — браузери показують системний діалог дозволу лише
 * в межах user gesture, тож викликати це "просто так" при завантаженні
 * сторінки безглуздо (діалог або не покажеться, або дратуватиме).
 */
export async function ensurePushPermission(): Promise<PushPermissionResult> {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';

  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied') return 'denied';

  try {
    const result = await Notification.requestPermission();
    return result === 'granted' ? 'granted' : 'denied';
  } catch {
    return 'denied';
  }
}

export function getPushPermissionState(): PushPermissionResult {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  return Notification.permission === 'granted' ? 'granted' : 'denied';
}
