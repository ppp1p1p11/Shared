import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

/** Haptics only for meaningful moments: join success, upload complete, long-press select, QR scanned. */
const enabled = Platform.OS !== 'web';

export const haptics = {
  success: () => enabled && Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}),
  warning: () => enabled && Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {}),
  select: () => enabled && Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}),
  tick: () => enabled && Haptics.selectionAsync().catch(() => {}),
};
