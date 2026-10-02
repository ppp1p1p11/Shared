import { router } from 'expo-router';
import { useMemo } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, LinearTransition } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { MediaImage } from '@/components/media/MediaImage';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { SheetHeader } from '@/components/ui/Header';
import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { Text } from '@/components/ui/Text';
import { cancelUpload } from '@/features/upload/engine';
import { summarize } from '@/features/upload/logic';
import { mediaOps } from '@/features/upload/mediaOps';
import { useUploads } from '@/features/upload/store';
import type { UploadItem } from '@/features/upload/types';
import { formatBytes } from '@/lib/format';
import { useColors } from '@/theme/ThemeProvider';
import { layout, radius, space } from '@/theme/tokens';

export default function Uploads() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const items = useUploads((s) => s.items);
  const network = useUploads((s) => s.network);
  const sorted = useMemo(() => [...items].sort((a, b) => rank(a) - rank(b) || a.createdAt - b.createdAt), [items]);
  const s = summarize(items);

  return (
    <View style={{ flex: 1 }}>
      <SheetHeader title={t('queue.title')} />
      {!items.length ? (
        <EmptyState icon="upload" title={t('queue.empty')} />
      ) : (
        <FlatList
          data={sorted}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{ paddingHorizontal: layout.gutter, paddingBottom: insets.bottom + space[6], gap: space[2] }}
          ListHeaderComponent={
            <View style={{ gap: space[3], marginBottom: space[3] }}>
              {network === 'offline' && <Banner tone="warning" icon="offline" title={t('queue.pillOffline')} body={t('errors.offline')} />}
              {network === 'wifi' && <Banner tone="warning" icon="offline" title={t('queue.pillWifi')} body={t('settings.wifiOnlyHint')} />}
              {s.pausedQuota > 0 && (
                <Banner tone="danger" icon="uploadOff" title={t('album.storageFullTitle')} body={t('album.storageFullBody')} action={<Button size="sm" variant="tinted" icon="sparkles" label={t('album.seePlans')} onPress={() => router.push('/paywall')} />} />
              )}
              <Text variant="footnote" color="textSecondary" tabular>
                {`${t('queue.pill', { done: s.done, count: s.total })} · ${formatBytes(s.bytesSent)} / ${formatBytes(s.bytesTotal)}`}
              </Text>
              <View style={{ flexDirection: 'row', gap: space[2] }}>
                {s.failed > 0 && <Button size="sm" variant="tinted" icon="refresh" label={t('queue.retryAll')} onPress={() => useUploads.getState().retryFailed()} />}
                {s.done > 0 && <Button size="sm" variant="secondary" label={t('queue.clearDone')} onPress={() => useUploads.getState().clearFinished()} />}
              </View>
            </View>
          }
          ListFooterComponent={
            <Text variant="footnote" color="textTertiary" style={{ marginTop: space[4] }}>
              {t('queue.keepOpenHint')}
            </Text>
          }
          renderItem={({ item }) => <Row item={item} />}
        />
      )}
    </View>
  );
}

const rank = (i: UploadItem) => ({ uploading: 0, finalizing: 0, preparing: 1, queued: 2, paused_quota: 3, failed: 4, duplicate: 5, done: 6 })[i.state];

function Row({ item }: { item: UploadItem }) {
  const { t } = useTranslation();
  const c = useColors();
  const pct = item.bytesTotal ? Math.round((item.bytesSent / item.bytesTotal) * 100) : 0;
  const label = {
    queued: t('queue.stateQueued'),
    preparing: t('queue.statePreparing'),
    uploading: t('queue.stateUploading', { percent: pct }),
    finalizing: t('queue.stateFinishing'),
    done: t('queue.stateDone'),
    duplicate: t('queue.stateDuplicate'),
    failed: item.error?.includes('source_lost') ? t('queue.stateSourceLost') : t('queue.stateFailed'),
    paused_quota: t('queue.statePausedQuota'),
  }[item.state];
  const tone = item.state === 'failed' || item.state === 'paused_quota' ? 'warning' : item.state === 'done' ? 'success' : 'textSecondary';
  const showBar = ['uploading', 'preparing', 'finalizing', 'queued'].includes(item.state);
  return (
    <Animated.View entering={FadeIn} layout={LinearTransition} style={[styles.row, { backgroundColor: c.surface }]}>
      <MediaImage localUri={mediaOps.previewUri(item)} style={styles.thumb} transition={0} />
      <View style={{ flex: 1, gap: space[1] }}>
        <Text variant="subhead" numberOfLines={1}>
          {item.source.filename}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[1] }}>
          {item.state === 'done' && <Icon name="checkCircle" size={14} color="success" />}
          <Text variant="footnote" color={tone} tabular>
            {label}
            {item.bytesTotal ? ` · ${formatBytes(item.bytesTotal)}` : ''}
          </Text>
        </View>
        {showBar && (
          <View style={[styles.track, { backgroundColor: c.surfacePressed }]}>
            <View style={[styles.fill, { width: `${Math.max(2, pct)}%`, backgroundColor: c.accent }]} />
          </View>
        )}
      </View>
      {item.state === 'failed' && item.error?.includes('source_lost') ? (
        <IconButton icon="close" size="sm" color="textTertiary" label={t('common.remove')} onPress={() => useUploads.getState().remove(item.id)} />
      ) : item.state === 'failed' ? (
        <IconButton icon="refresh" size="sm" label={t('common.retry')} onPress={() => useUploads.getState().patch(item.id, { state: 'queued', attempts: 0, error: undefined, nextAttemptAt: undefined })} />
      ) : item.state !== 'done' && item.state !== 'duplicate' ? (
        <IconButton icon="close" size="sm" color="textTertiary" label={t('queue.cancelItem')} onPress={() => cancelUpload(item.id)} />
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space[3], padding: space[2], paddingRight: space[1], borderRadius: radius.md },
  thumb: { width: 52, height: 52, borderRadius: radius.sm },
  track: { height: 4, borderRadius: 2, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 2 },
});
