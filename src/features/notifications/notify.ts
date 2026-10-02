import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

/**
 * Notifications, prototype level: local notifications only. The call sites already go through
 * this function, so moving to remote push later only means registering a push token
 * (Notifications.getExpoPushTokenAsync) and sending from the server, e.g. on media INSERT.
 */
let permission: boolean | null = null;

export async function notify(n: { title: string; body?: string; data?: Record<string, unknown> }) {
  if (Platform.OS === 'web') return;
  try {
    if (permission === null) {
      const current = await Notifications.getPermissionsAsync();
      permission = current.granted;
    }
    if (!permission) return; // never prompt from the background; asked in context instead
    await Notifications.scheduleNotificationAsync({ content: { title: n.title, body: n.body, data: n.data }, trigger: null });
  } catch {}
}

export async function askNotificationPermission() {
  if (Platform.OS === 'web') return false;
  const r = await Notifications.requestPermissionsAsync();
  permission = r.granted;
  return r.granted;
}
