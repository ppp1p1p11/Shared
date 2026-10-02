import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet } from 'react-native';
import Animated, { FadeInDown, FadeOutDown, LinearTransition } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';

import { GlassSurface } from '@/components/ui/GlassSurface';
import { Icon } from '@/components/ui/Icon';
import { PressableScale } from '@/components/ui/PressableScale';
import { ProgressRing } from '@/components/ui/ProgressRing';
import { Text } from '@/components/ui/Text';
import { useColors } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';
import { summarize } from './logic';
import { useUploads } from './store';

/**
 * Persistent, non-intrusive progress pill: "Uploading 23 of 143". Tappable for details.
 * Communicates every state: uploading, offline, waiting for Wi-Fi, paused (storage full), done.
 */
export function UploadPill({ albumId, bottom }: { albumId?: string; bottom: number }) {
  const { t } = useTranslation();
  const c = useColors();
  const all = useUploads((s) => s.items);
  const network = useUploads((s) => s.network);
  const items = useMemo(() => (albumId ? all.filter((i) => i.albumId === albumId) : all), [all, albumId]);
  const s = summarize(items);
  const [doneVisible, setDoneVisible] = useState(false);

  useEffect(() => {
    if (s.allDone) {
      setDoneVisible(true);
      const tm = setTimeout(() => {
        setDoneVisible(false);
        useUploads.getState().clearFinished();
      }, 2600);
      return () => clearTimeout(tm);
    }
  }, [s.allDone]);

  if (!items.length || (s.allDone && !doneVisible)) return null;

  const busy = s.active > 0;
  let label: string;
  let icon: 'offline' | 'uploadOff' | 'checkCircle' | 'alert' | null = null;
  if (s.allDone) {
    label = t('queue.pillDone');
    icon = 'checkCircle';
  } else if (busy && network === 'offline') {
    label = t('queue.pillOffline');
    icon = 'offline';
  } else if (busy && network === 'wifi') {
    label = t('queue.pillWifi');
    icon = 'offline';
  } else if (!busy && s.pausedQuota > 0) {
    label = t('queue.pillPaused');
    icon = 'uploadOff';
  } else if (!busy && s.failed > 0) {
    label = t('queue.stateFailed');
    icon = 'alert';
  } else {
    label = t('queue.pill', { done: Math.min(s.done + 1, s.total), count: s.total });
  }

  return (
    <Animated.View entering={FadeInDown.springify().damping(20)} exiting={FadeOutDown.duration(200)} layout={LinearTransition} style={[styles.wrap, { bottom }]} pointerEvents="box-none">
      <PressableScale onPress={() => router.push('/uploads')} accessibilityRole="button" accessibilityLabel={t('queue.a11yPill', { label })} testID="upload-pill">
        <GlassSurface style={styles.pill} interactive>
          {icon ? (
            <Icon name={icon} size="sm" color={icon === 'checkCircle' ? 'success' : icon === 'alert' || icon === 'uploadOff' ? 'warning' : 'textSecondary'} />
          ) : (
            <ProgressRing progress={s.progress} size={20} color={c.accent} track={c.accentSoft} />
          )}
          <Text variant="subhead" weight="600" tabular>
            {label}
          </Text>
        </GlassSurface>
      </PressableScale>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 15 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: space[2], paddingHorizontal: space[4], paddingVertical: space[2], minHeight: 44, borderRadius: radius.pill },
});
