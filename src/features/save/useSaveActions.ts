import { Linking } from 'react-native';
import { useTranslation } from 'react-i18next';

import { haptics } from '@/lib/haptics';
import type { Media } from '@/lib/types';
import { toast } from '@/stores/overlay';
import { MAX_SHARE, PermissionDenied, saveToDevice, shareOriginals } from './save';

/** UI wrapper: friendly toasts for progress, success and every failure mode. */
export function useSaveActions(albumName: string) {
  const { t } = useTranslation();

  const save = async (items: Media[]) => {
    if (!items.length) return;
    if (items.length > 1) toast(t('save.saving', { count: items.length }), { icon: 'download' });
    try {
      const n = await saveToDevice(items, albumName);
      if (n === items.length) {
        haptics.success();
        toast(items.length === 1 ? t('viewer.saved') : t('save.saved', { count: n, album: albumName }), { icon: 'checkCircle', tone: 'success' });
      } else {
        toast(t('save.failed'), { icon: 'alert', tone: 'danger' });
      }
    } catch (e) {
      if (e instanceof PermissionDenied) {
        toast(t('errors.permissionPhotos'), { icon: 'alert', tone: 'danger', actionLabel: t('errors.openSettings'), onAction: () => Linking.openSettings() });
      } else toast(t('save.failed'), { icon: 'alert', tone: 'danger' });
    }
  };

  const share = async (items: Media[]) => {
    if (items.length > MAX_SHARE) {
      toast(t('save.shareTooMany', { count: MAX_SHARE }), { icon: 'info', actionLabel: t('common.save'), onAction: () => save(items) });
      return;
    }
    try {
      await shareOriginals(items);
    } catch {
      toast(t('save.failed'), { icon: 'alert', tone: 'danger' });
    }
  };

  return { save, share };
}
