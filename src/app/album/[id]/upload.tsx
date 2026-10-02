import { FlashList } from '@shopify/flash-list';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Linking, Platform, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { SheetHeader } from '@/components/ui/Header';
import { Icon } from '@/components/ui/Icon';
import { Segmented } from '@/components/ui/Segmented';
import { Skeleton } from '@/components/ui/Skeleton';
import { Text } from '@/components/ui/Text';
import { UPLOAD } from '@/config/limits';
import { useAlbum } from '@/features/albums/api';
import { getLibraryAccess, loadLibrary, manageLimitedAccess, pickWithSystemPicker, requestLibraryAccess, type Candidate, type LibraryAccess } from '@/features/upload/review/library';
import { useUploads } from '@/features/upload/store';
import { formatBytes, formatDateRange, formatDuration, parseLocalDate } from '@/lib/format';
import { haptics } from '@/lib/haptics';
import { usePrefs } from '@/stores/prefs';
import { useColors } from '@/theme/ThemeProvider';
import { layout, radius, space } from '@/theme/tokens';

type Tab = 'range' | 'recent' | 'picked';
const GAP = 2;

/** Typical sizes for the estimate when the exact size isn't known yet (HEIC ~3 MB; video ~2.5 MB/s). */
const estimate = (c: Candidate) => c.size ?? (c.kind === 'video' ? Math.max(1, (c.durationMs ?? 10_000) / 1000) * 2.5 * 1024 * 1024 : 3 * 1024 * 1024);

export default function UploadReview() {
  const { id, mode } = useLocalSearchParams<{ id: string; mode?: string }>();
  const { t } = useTranslation();
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const album = useAlbum(id);
  const setPrefs = usePrefs((s) => s.set);

  const hasRange = !!album.data?.start_date;
  const [access, setAccess] = useState<LibraryAccess | null>(null);
  const [tab, setTab] = useState<Tab>(Platform.OS === 'web' ? 'picked' : mode === 'range' || hasRange ? 'range' : 'recent');
  const [items, setItems] = useState<Candidate[] | null>(null);
  const [picked, setPicked] = useState<Candidate[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    getLibraryAccess().then(setAccess);
  }, []);
  useEffect(() => {
    if (hasRange && Platform.OS !== 'web' && tab === 'recent' && !items && mode !== 'recent') setTab('range');
  }, [hasRange]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load library candidates for the current tab.
  useEffect(() => {
    if (tab === 'picked' || !access || (access !== 'all' && access !== 'limited') || !album.data) return;
    setItems(null);
    const a = album.data;
    const opts =
      tab === 'range' && a.start_date
        ? (() => {
            const start = parseLocalDate(a.start_date);
            const end = parseLocalDate(a.end_date ?? a.start_date);
            end.setHours(23, 59, 59, 999);
            return { start, end };
          })()
        : { limit: 600 };
    loadLibrary(opts).then((list) => {
      setItems(list);
      // The smart suggestion arrives pre-selected (and fully reviewable).
      setSelected(tab === 'range' ? new Set(list.map((x) => x.key)) : new Set());
    });
  }, [tab, access, album.data]);

  const data = tab === 'picked' ? picked : (items ?? []);
  const chosen = useMemo(() => data.filter((x) => selected.has(x.key)), [data, selected]);
  const bytes = chosen.reduce((s, x) => s + estimate(x), 0);
  const columns = width > 600 ? 6 : 4;
  const size = (Math.min(width, 900) - GAP * (columns - 1)) / columns;

  const toggle = useCallback((key: string) => {
    haptics.tick();
    setSelected((s) => {
      const n = new Set(s);
      n.has(key) ? n.delete(key) : n.add(key);
      return n;
    });
  }, []);

  const openPicker = async () => {
    const list = await pickWithSystemPicker();
    if (!list.length) return;
    setPicked(list);
    setSelected(new Set(list.map((x) => x.key)));
    setTab('picked');
  };

  const allow = async () => setAccess(await requestLibraryAccess());

  const submit = () => {
    if (!chosen.length) return;
    useUploads.getState().add(
      id,
      chosen.map((x) => ({
        assetId: x.assetId,
        uri: x.uri,
        filename: x.filename,
        mimeType: x.mimeType,
        kind: x.kind,
        width: x.width,
        height: x.height,
        durationMs: x.durationMs,
        capturedAt: x.capturedAt,
        sizeHint: x.size ?? Math.round(estimate(x)),
        livePhotoUri: x.livePhotoUri ?? null,
      })),
    );
    setPrefs({ suggestionHandled: { ...usePrefs.getState().suggestionHandled, [id]: true } });
    haptics.success();
    router.back();
  };

  const rangeLabel = album.data ? formatDateRange(album.data.start_date, album.data.end_date) : null;
  const needsPermission = Platform.OS !== 'web' && access !== null && access !== 'all' && access !== 'limited' && tab !== 'picked';
  const keepLocation = album.data?.keep_location;

  const header = (
    <View style={{ gap: space[3], paddingHorizontal: layout.gutter, paddingBottom: space[3] }}>
      {Platform.OS !== 'web' && !needsPermission && (
        <Segmented<Tab>
          value={tab}
          onChange={setTab}
          options={[
            ...(hasRange ? [{ value: 'range' as const, label: t('upload.fromDates') }] : []),
            { value: 'recent', label: t('upload.allPhotos') },
            ...(picked.length ? [{ value: 'picked' as const, label: t('upload.reviewTitle', { count: picked.length }) }] : []),
          ]}
        />
      )}
      {tab === 'range' && items && items.length > 0 && (
        <Animated.View entering={FadeIn} style={{ gap: space[1] }}>
          <Text variant="title3">{t('upload.suggestionTitle', { count: items.length, range: rangeLabel })}</Text>
          <Text variant="footnote" color="textSecondary">
            {t('upload.suggestionBody')}
          </Text>
        </Animated.View>
      )}
      {access === 'limited' && tab !== 'picked' && (
        <Banner icon="info" title={t('upload.limitedAccess')} action={<Button size="sm" variant="tinted" label={t('upload.manageAccess')} onPress={() => manageLimitedAccess().then(() => setItems(null))} />} />
      )}
      {data.length > 0 && (
        <View style={styles.selectRow}>
          <Text variant="subhead" color="textSecondary">
            {t('album.selectedCount', { count: chosen.length })}
          </Text>
          <Button
            size="sm"
            variant="ghost"
            label={chosen.length === data.length ? t('common.deselectAll') : t('common.selectAll')}
            onPress={() => setSelected(chosen.length === data.length ? new Set() : new Set(data.map((x) => x.key)))}
          />
        </View>
      )}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <SheetHeader title={t('upload.title')} />

      {needsPermission ? (
        <View style={styles.center}>
          <EmptyState icon="album" title={t('upload.permissionTitle')} body={t('upload.permissionBody')}>
            {access === 'denied' ? (
              <Button label={t('errors.openSettings')} onPress={() => Linking.openSettings()} />
            ) : (
              <Button label={t('upload.allowAccess')} onPress={allow} testID="allow-library" />
            )}
            <Button label={t('upload.chooseOther')} variant="secondary" onPress={openPicker} />
          </EmptyState>
        </View>
      ) : Platform.OS === 'web' && !picked.length ? (
        <View style={styles.center}>
          <EmptyState icon="addPhoto" title={t('upload.permissionTitle')} body={t('upload.locationStripped')}>
            <Button label={t('upload.choosePhotos')} icon="addPhoto" onPress={openPicker} testID="web-pick" />
          </EmptyState>
        </View>
      ) : (
        <FlashList
          data={data}
          numColumns={columns}
          keyExtractor={(x) => x.key}
          ListHeaderComponent={header}
          extraData={selected}
          contentContainerStyle={{ paddingBottom: 160 + insets.bottom }}
          ListEmptyComponent={
            items === null && tab !== 'picked' ? (
              <View style={[styles.skeletonGrid, { gap: GAP }]}>
                {Array.from({ length: columns * 5 }, (_, i) => (
                  <Skeleton key={i} width={size} height={size} rounded={0} />
                ))}
              </View>
            ) : (
              <EmptyState icon="calendar" title={t('upload.noneInRange')}>
                <Button label={t('upload.chooseOther')} variant="secondary" onPress={openPicker} />
              </EmptyState>
            )
          }
          renderItem={({ item }) => <Thumb item={item} size={size} selected={selected.has(item.key)} onPress={toggle} />}
        />
      )}

      {!needsPermission && (
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, space[3]), backgroundColor: c.bg, borderTopColor: c.separator }]}>
          <View style={{ gap: 2, alignItems: 'center' }}>
            <Text variant="subhead" weight="600" tabular>
              {t('upload.estimate', { count: chosen.length, size: formatBytes(bytes) })}
              {bytes > UPLOAD.wifiRecommendedBytes ? ` · ${t('upload.wifiRecommended')}` : ''}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[1] }}>
              <Icon name={keepLocation ? 'location' : 'locationOff'} size={13} color="textTertiary" />
              <Text variant="caption" color="textTertiary">
                {keepLocation ? t('upload.locationKept') : t('upload.locationStripped')}
              </Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: space[2], width: '100%', maxWidth: 520 }}>
            <Button label={t('upload.libraryShort')} icon="album" variant="secondary" size="md" onPress={openPicker} style={{ flex: 1 }} />
            <Button testID="upload-submit" label={t('upload.addCta', { count: chosen.length })} size="md" onPress={submit} disabled={!chosen.length} style={{ flex: 1.3 }} />
          </View>
        </View>
      )}
    </View>
  );
}

function Thumb({ item, size, selected, onPress }: { item: Candidate; size: number; selected: boolean; onPress: (k: string) => void }) {
  const c = useColors();
  return (
    <Pressable
      onPress={() => onPress(item.key)}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={item.filename}
      style={{ width: size, height: size, marginBottom: GAP }}
    >
      <Image source={{ uri: item.uri }} style={StyleSheet.absoluteFill} contentFit="cover" recyclingKey={item.key} transition={100} />
      {!selected && <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(255,255,255,0.35)' }]} />}
      {item.kind === 'video' && (
        <Text variant="caption" style={styles.duration}>
          {formatDuration(item.durationMs)}
        </Text>
      )}
      <View style={[styles.check, selected ? { backgroundColor: c.accent, borderColor: '#FFF' } : { borderColor: '#FFF', backgroundColor: 'rgba(0,0,0,0.25)' }]}>
        {selected && <Icon name="check" size={13} rawColor={c.onAccent} strokeWidth={3} />}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center' },
  selectRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  skeletonGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingTop: space[3], paddingHorizontal: layout.gutter, gap: space[3], alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth },
  check: { position: 'absolute', right: 6, top: 6, width: 24, height: 24, borderRadius: radius.pill, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  duration: { position: 'absolute', right: 6, bottom: 4, color: '#FFF', textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 3 },
});
