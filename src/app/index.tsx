import { router } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { FadeInDown, LinearTransition } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { EmptyArt } from '@/components/ui/EmptyArt';
import { EmptyState } from '@/components/ui/EmptyState';
import { GlassSurface } from '@/components/ui/GlassSurface';
import { IconButton } from '@/components/ui/IconButton';
import { Skeleton } from '@/components/ui/Skeleton';
import { Text } from '@/components/ui/Text';
import { useMyAlbums } from '@/features/albums/api';
import { AlbumCard } from '@/features/albums/components/AlbumCard';
import { retryAuth, useAuth } from '@/features/auth/session';
import { errorMessage } from '@/lib/errors';
import { usePrefs } from '@/stores/prefs';
import { useColors } from '@/theme/ThemeProvider';
import { layout, radius, space } from '@/theme/tokens';

export default function Home() {
  const { t } = useTranslation();
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const auth = useAuth();
  const albums = useMyAlbums();
  const nudgeDismissed = usePrefs((s) => s.upgradeNudgeDismissed);
  const setPrefs = usePrefs((s) => s.set);
  const [refreshing, setRefreshing] = useState(false);

  const contentWidth = Math.min(width, layout.maxContentWidth + layout.gutter * 2) - layout.gutter * 2;
  // Active albums first (most recent activity, from the server); pending requests after them.
  const list = useMemo(() => [...(albums.data ?? [])].sort((a, b) => Number(a.status === 'pending') - Number(b.status === 'pending')), [albums.data]);
  const isEmpty = albums.isSuccess && list.length === 0;
  const showNudge = auth.isAnonymous && !nudgeDismissed && list.filter((a) => a.status === 'active').length >= 2;

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await albums.refetch();
    setRefreshing(false);
  }, [albums]);

  const bottomBarH = 56 + space[3] * 2 + Math.max(insets.bottom, space[3]);

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView
        contentInsetAdjustmentBehavior="never"
        contentContainerStyle={{ paddingTop: insets.top + space[2], paddingBottom: bottomBarH + space[6], alignItems: 'center', flexGrow: 1 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.textTertiary} />}
      >
        <View style={[styles.header, { width: contentWidth }]}>
          <Text variant="display" accessibilityRole="header">
            {t('home.title')}
          </Text>
          <IconButton icon="more" variant="filled" label={t('settings.title')} onPress={() => router.push('/settings')} testID="open-settings" />
        </View>

        <View style={{ width: contentWidth, gap: space[5], flexGrow: isEmpty ? 1 : 0, justifyContent: isEmpty ? 'center' : 'flex-start', paddingBottom: isEmpty ? space[16] : 0 }}>
          {showNudge && (
            <Banner
              icon="shield"
              title={t('home.upgradeNudgeTitle')}
              body={t('home.upgradeNudgeBody')}
              onDismiss={() => setPrefs({ upgradeNudgeDismissed: true })}
              dismissLabel={t('common.notNow')}
              action={<Button size="sm" variant="tinted" label={t('home.upgradeNudgeCta')} onPress={() => router.push('/settings/account')} />}
            />
          )}

          {(albums.isPending || auth.status === 'loading') && auth.status !== 'error' && (
            <View style={{ gap: space[5] }}>
              {[0, 1].map((i) => (
                <View key={i} style={[styles.skeletonCard, { backgroundColor: c.surfaceRaised, borderColor: c.separator }]}>
                  <Skeleton height={Math.round(contentWidth * 0.62)} rounded={0} />
                  <View style={{ padding: space[4], gap: space[2] }}>
                    <Skeleton width="55%" height={20} />
                    <Skeleton width="35%" height={14} />
                  </View>
                </View>
              ))}
            </View>
          )}

          {(albums.isError || auth.status === 'error') && (
            <EmptyState icon="uploadOff" tone="danger" title={t('home.errorTitle')} body={errorMessage(albums.error ?? 'offline')}>
              <Button label={t('common.retry')} variant="secondary" onPress={() => (auth.status === 'error' ? retryAuth() : albums.refetch())} />
            </EmptyState>
          )}

          {isEmpty && (
            <EmptyState art={<EmptyArt />} title={t('home.emptyTitle')} body={t('home.emptyBody')} />
          )}

          {list.map((album, i) => (
            <Animated.View key={album.id} entering={FadeInDown.delay(Math.min(i, 6) * 50).duration(320)} layout={LinearTransition}>
              <AlbumCard album={album} width={contentWidth} />
            </Animated.View>
          ))}
        </View>
      </ScrollView>

      {/* Thumb-first primary actions */}
      <View pointerEvents="box-none" style={[styles.bottomWrap, { paddingBottom: Math.max(insets.bottom, space[3]) }]}>
        <GlassSurface style={[styles.bottomBar, { width: contentWidth + space[2] }]} interactive>
          <Button
            testID="create-album"
            label={isEmpty ? t('home.createCta') : t('home.newAlbum')}
            icon="add"
            onPress={() => router.push('/create')}
            style={{ flex: 1 }}
          />
          <Button
            testID="join-album"
            label={isEmpty ? t('home.join') : t('home.join')}
            icon="qr"
            variant="secondary"
            onPress={() => router.push('/join')}
            style={{ paddingHorizontal: space[5] }}
          />
        </GlassSurface>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space[5], marginTop: space[2] },
  skeletonCard: { borderRadius: radius.xl, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth },
  bottomWrap: { position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center' },
  bottomBar: { flexDirection: 'row', gap: space[2], padding: space[1.5], borderRadius: radius.xl + 4 },
});
