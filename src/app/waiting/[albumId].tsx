import { useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withSequence, withTiming, ZoomIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { Text } from '@/components/ui/Text';
import { useLeaveAlbum, useMyAlbums } from '@/features/albums/api';
import { useAuth } from '@/features/auth/session';
import { haptics } from '@/lib/haptics';
import { qk } from '@/lib/queryClient';
import { useRealtime } from '@/lib/realtime';
import { supabase } from '@/lib/supabase';
import { useColors } from '@/theme/ThemeProvider';
import { layout, radius, space } from '@/theme/tokens';

type Phase = 'waiting' | 'approved' | 'declined';

export default function Waiting() {
  const { albumId } = useLocalSearchParams<{ albumId: string }>();
  const { t } = useTranslation();
  const c = useColors();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const userId = useAuth((s) => s.userId);
  const albums = useMyAlbums();
  const leave = useLeaveAlbum(albumId);
  const [phase, setPhase] = useState<Phase>('waiting');
  const summary = albums.data?.find((a) => a.id === albumId);

  const onStatus = (status: string | null) => {
    if (status === 'active') {
      setPhase('approved');
      haptics.success();
      qc.invalidateQueries({ queryKey: qk.albums });
      setTimeout(() => router.replace(`/album/${albumId}`), 1100);
    } else if (status === 'removed' || status === null) {
      setPhase('declined');
    }
  };

  // Live: the owner's approval arrives over realtime (RLS lets us see only our own row).
  useRealtime(userId ? `waiting:${albumId}` : null, [{ table: 'album_members', filter: `user_id=eq.${userId}` }], (_t, payload) => {
    const row = (payload.new ?? {}) as { album_id?: string; status?: string };
    if (row.album_id === albumId) onStatus(row.status ?? null);
  });

  // Safety net if the socket drops (backgrounded phone, flaky network).
  useEffect(() => {
    if (!userId || phase !== 'waiting') return;
    const check = async () => {
      const { data } = await supabase.from('album_members').select('status').eq('album_id', albumId).eq('user_id', userId).maybeSingle();
      if (data?.status !== 'pending') onStatus(data?.status ?? null);
    };
    check();
    const id = setInterval(check, 15_000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, albumId, phase]);

  return (
    <View style={[styles.root, { backgroundColor: c.bg, paddingTop: insets.top, paddingBottom: insets.bottom + space[4] }]}>
      <View style={styles.center}>
        {phase === 'waiting' && <Pulse />}
        {phase === 'approved' && (
          <Animated.View entering={ZoomIn.springify().damping(12)} style={[styles.badge, { backgroundColor: c.successSoft }]}>
            <Icon name="check" size={44} color="success" strokeWidth={2.5} />
          </Animated.View>
        )}
        {phase === 'declined' && (
          <Animated.View entering={FadeIn} style={[styles.badge, { backgroundColor: c.surface }]}>
            <Icon name="lock" size={40} color="textSecondary" />
          </Animated.View>
        )}

        <Animated.View key={phase} entering={FadeIn.duration(260)} style={{ alignItems: 'center', gap: space[2], paddingHorizontal: layout.gutter }}>
          {summary && (
            <Text variant="subhead" color="textSecondary" align="center">
              {summary.name}
            </Text>
          )}
          <Text variant="title1" align="center" accessibilityLiveRegion="polite">
            {phase === 'waiting' ? t('waiting.title') : phase === 'approved' ? t('waiting.approved') : t('waiting.declined')}
          </Text>
          {phase === 'waiting' && (
            <Text variant="callout" color="textSecondary" align="center" style={{ maxWidth: 340 }}>
              {t('waiting.body', { owner: summary?.owner_name || t('waiting.ownerFallback') })}
            </Text>
          )}
        </Animated.View>

        {phase === 'waiting' && (
          <View style={[styles.liveChip, { backgroundColor: c.surface }]}>
            <View style={[styles.dot, { backgroundColor: c.accent }]} />
            <Text variant="footnote" color="textSecondary">
              {t('waiting.live')}
            </Text>
          </View>
        )}
      </View>

      <View style={{ paddingHorizontal: layout.gutter, gap: space[2], width: '100%', maxWidth: layout.maxContentWidth, alignSelf: 'center' }}>
        <Button label={t('join.goHome')} variant="secondary" onPress={() => router.replace('/')} />
        {phase === 'waiting' && (
          <Button
            label={t('waiting.cancelRequest')}
            variant="ghost"
            size="md"
            loading={leave.isPending}
            onPress={() => leave.mutate(undefined, { onSuccess: () => router.replace('/') })}
          />
        )}
      </View>
    </View>
  );
}

/** Gentle breathing hourglass while we wait. Static with Reduce Motion. */
function Pulse() {
  const c = useColors();
  const reduced = useReducedMotion();
  const s = useSharedValue(1);
  useEffect(() => {
    if (!reduced) s.value = withRepeat(withSequence(withTiming(1.08, { duration: 1100 }), withTiming(1, { duration: 1100 })), -1);
  }, [reduced, s]);
  const ring = useAnimatedStyle(() => ({ transform: [{ scale: s.value }], opacity: 2 - s.value * 1.2 }));
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={[styles.halo, { backgroundColor: c.accentSoft }, ring]} />
      <View style={[styles.badge, { backgroundColor: c.accentSoft, position: 'absolute' }]}>
        <Icon name="hourglass" size={40} color="accent" strokeWidth={1.5} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'space-between' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space[6] },
  badge: { width: 96, height: 96, borderRadius: radius.xxl, alignItems: 'center', justifyContent: 'center' },
  halo: { width: 140, height: 140, borderRadius: 70 },
  liveChip: { flexDirection: 'row', alignItems: 'center', gap: space[2], paddingHorizontal: space[3], paddingVertical: space[1.5], borderRadius: radius.pill },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
