import { Alert, Platform } from 'react-native';

import i18n from '@/i18n';
import { actionSheet } from '@/stores/overlay';

/**
 * Native confirmation dialog (UIAlertController / Material dialog). On web, where Alert is a
 * no-op, the same choice is presented in the app's own action sheet.
 */
export function confirm(opts: {
  title: string;
  message?: string;
  confirmLabel: string;
  destructive?: boolean;
  extra?: { label: string; destructive?: boolean; onPress: () => void };
}): Promise<boolean> {
  return new Promise((resolve) => {
    if (Platform.OS === 'web') {
      actionSheet({
        title: opts.title,
        message: opts.message,
        cancelLabel: i18n.t('common.cancel'),
        actions: [
          ...(opts.extra ? [{ label: opts.extra.label, destructive: opts.extra.destructive, onPress: () => { opts.extra!.onPress(); resolve(false); } }] : []),
          { label: opts.confirmLabel, destructive: opts.destructive, onPress: () => resolve(true) },
        ],
      });
      // Cancel resolves false via the sheet's dismiss path:
      cancelResolvers.push(() => resolve(false));
      return;
    }
    Alert.alert(opts.title, opts.message, [
      { text: i18n.t('common.cancel'), style: 'cancel', onPress: () => resolve(false) },
      ...(opts.extra
        ? [{ text: opts.extra.label, style: opts.extra.destructive ? ('destructive' as const) : ('default' as const), onPress: () => { opts.extra!.onPress(); resolve(false); } }]
        : []),
      { text: opts.confirmLabel, style: opts.destructive ? 'destructive' : 'default', onPress: () => resolve(true) },
    ]);
  });
}

const cancelResolvers: (() => void)[] = [];
/** Called by the action sheet host when dismissed without choosing. */
export function flushCancelledConfirms() {
  while (cancelResolvers.length) cancelResolvers.shift()!();
}
