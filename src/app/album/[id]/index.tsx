import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View, useWindowDimensions, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { EmptyArt } from '@/components/ui/EmptyArt';
import { EmptyState } from '@/components/ui/EmptyState';
import { GlassSurface } from '@/components/ui/GlassSurface';
import { IconButton } from '@/components/ui/IconButton';
import { Skeleton } from '@/components/ui/Skeleton';
import { useAlbum, useAlbumStorage, useMembers, useUpdateAlbum } from '@/features/albums/api';
import { AlbumTopBar } from '@/features/album/AlbumTopBar';
import { ContributorFilter, type ContributorFilterValue } from '@/features/album/ContributorFilter';
import { DayHeader } from '@/features/album/DayHeader';
import { MediaTile } from '@/features/album/MediaTile';
import { NewItemsChip } from '@/features/album/NewItemsChip';
import { SelectionBar } from '@/features/album/SelectionBar';
import { useRangeSuggestion } from '@/features/album/useRangeSuggestion';
import { useAuth } from '@/features/auth/session';
import { applyMediaChange, reportMedia, useAlbumMedia, useDeleteMedia, useSetHidden } from '@/features/media/api';
import { buildGrid, nextDensity, type Cell, type Row } from '@/features/media/grid';
import { useSaveActions } from '@/features/save/useSaveActions';
import { UploadPill } from '@/features/upload/UploadPill';
import { useUploads } from '@/features/upload/store';
import { Viewer, type Rect } from '@/features/viewer/Viewer';
import { confirm } from '@/lib/confirm';
import { errorCode, errorMessage } from '@/lib/errors';
import { formatBytes, formatDateRange, formatDateTime, formatDuration } from '@/lib/format';
import { haptics } from '@/lib/haptics';
import { qk } from '@/lib/queryClient';
import { useRealtime } from '@/lib/realtime';
import type { Media } from '@/lib/types';
import { actionSheet, toast } from '@/stores/overlay';
import { usePrefs } from '@/stores/prefs';
import { useColors } from '@/theme/ThemeProvider';
import { layout, radius, space } from '@/theme/tokens';

const GAP = 2;
const HEADER_H = 44;
const TOPBAR_H = 56;

export default function AlbumScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const c = useColors();
  const qc = useQueryClient();
  const insets = useSafeAreaInsets();
  const { width: W, height: H } = useWindowDimensions();
  const userId = useAuth((s) => s.userId);

  const album = useAlbum(id);
  const members = useMembers(id);
  const media = useAlbumMedia(id);
  const storage = useAlbumStorage(id);
  const updateAlbum = useUpdateAlbum(id);
  const del = useDeleteMedia(id);
  const setHidden = useSetHidden(id);
  const allUploads = useUploads((s) => s.items);
  const uploads = useMemo(() => allUploads.filter((u) => u.albumId === id), [allUploads, id]);

  const columns = usePrefs((s) => s.gridColumns);
  const setPrefs = usePrefs((s) => s.set);
  const storageWarned = usePrefs((s) => s.storageWarned[id]);
  const suggestionHandled = usePrefs((s) => s.suggestionHandled[id]);

  const [filter, setFilter] = useState<ContributorFilterValue>('all');
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [fresh, setFresh] = useState<{ id: string; uploader: string }[]>([]);
  const [listHeaderH, setListHeaderH] = useState(0);
  const listRef = useRef<FlashListRef<Row>>(null);
  const scrollY = useRef(0);
  const listTop = insets.top + TOPBAR_H; // the list starts under the solid top bar, so day headers stick right below it

  const a = album.data;
  const isOwner = !!a && a.owner_id === userId;
  const { save, share } = useSaveActions(a?.name ?? 'Rolo');

  // ── names
  const nameFor = useCallback(
    (uid: string) => {
      if (uid === userId) return t('common.you');
      return members.data?.find((m) => m.user_id === uid)?.profile?.display_name || t('common.anonymousName');
    },
    [members.data, userId, t],
  );

  // ── grid model
  const filterFn = useCallback(
    (cell: Cell) => (filter === 'all' ? true : filter === 'mine' ? cell.uploaderId === userId || cell.uploaderId === '__me__' : cell.uploaderId === filter),
    [filter, userId],
  );
  const grid = useMemo(() => buildGrid(media.data ?? [], uploads, columns, filterFn), [media.data, uploads, columns, filterFn]);
  const cellSize = (W - GAP * (columns - 1)) / columns;
  const rowOffsets = useMemo(() => {
    const out: number[] = [];
    let y = 0;
    for (const r of grid.rows) {
      out.push(y);
      y += r.type === 'header' ? HEADER_H : cellSize + GAP;
    }
    return out;
  }, [grid.rows, cellSize]);

  const contributors = useMemo(() => {
    const counts = new Map<string, number>();
    for (const m of media.data ?? []) counts.set(m.uploader_id, (counts.get(m.uploader_id) ?? 0) + 1);
    return [...counts.entries()]
      .filter(([uid]) => uid !== userId)
      .sort((x, y) => y[1] - x[1])
      .map(([uid, count]) => ({ id: uid, name: nameFor(uid), color: members.data?.find((m) => m.user_id === uid)?.profile?.avatar_color ?? 0, count }));
  }, [media.data, userId, nameFor, members.data]);

  // ── realtime: new uploads from others appear live, with a subtle chip
  useRealtime(
    userId && id ? `album:${id}` : null,
    [
      { table: 'media', filter: `album_id=eq.${id}` },
      { table: 'album_members', filter: `album_id=eq.${id}` },
      { table: 'albums', filter: `id=eq.${id}` },
    ],
    (table, payload) => {
      if (table === 'media') {
        const row = (payload.eventType === 'DELETE' ? payload.old : payload.new) as Media;
        if (!row?.id) return;
        const existed = (qc.getQueryData<Media[]>(qk.media(id)) ?? []).some((m) => m.id === row.id);
        qc.setQueryData<Media[]>(qk.media(id), (l) => applyMediaChange(l, payload.eventType as any, row));
        if (!existed && row.status === 'ready' && row.uploader_id !== userId) {
          setFresh((f) => [...f, { id: row.id, uploader: row.uploader_id }]);
        }
        qc.invalidateQueries({ queryKey: qk.albumStorage(id) });
      } else if (table === 'album_members') {
        qc.invalidateQueries({ queryKey: qk.members(id) });
        const row = payload.new as { user_id?: string; status?: string };
        if (row?.user_id === userId && row.status === 'removed') qc.invalidateQueries({ queryKey: qk.album(id) });
      } else {
        qc.invalidateQueries({ queryKey: qk.album(id) });
      }
    },
  );
  useEffect(() => {
    if (!fresh.length) return;
    const tm = setTimeout(() => setFresh([]), 12_000);
    return () => clearTimeout(tm);
  }, [fresh]);
  const freshIds = useMemo(() => new Set(fresh.map((f) => f.id)), [fresh]);

  // ── storage: 80% heads-up, 100% pause + paywall (owner), never lose the queue
  const ratio = storage.data ? storage.data.owner_used_bytes / storage.data.owner_limit_bytes : 0;
  const pausedHere = uploads.some((u) => u.state === 'paused_quota');
  const paywallShown = useRef(false);
  useEffect(() => {
    if (pausedHere && isOwner && !paywallShown.current) {
      paywallShown.current = true;
      router.push({ pathname: '/paywall', params: { albumId: id, reason: 'full' } });
    }
  }, [pausedHere, isOwner, id]);

  // ── smart suggestion
  const suggestCount = useRangeSuggestion(a, !suggestionHandled && !!a?.start_date);
  const rangeLabel = a ? formatDateRange(a.start_date, a.end_date) : null;

  // ── pinch to change density
  const pinchScale = useSharedValue(1);
  const applyPinch = useCallback(
    (s: number) => {
      const next = nextDensity(columns, s);
      if (next !== columns) {
        haptics.tick();
        setPrefs({ gridColumns: next });
      }
    },
    [columns, setPrefs],
  );
  const pinch = Gesture.Pinch()
    .onUpdate((e) => {
      pinchScale.value = Math.max(0.85, Math.min(1.15, e.scale));
    })
    .onEnd((e) => {
      runOnJS(applyPinch)(e.scale);
      pinchScale.value = withSpring(1, { damping: 20, stiffness: 260 });
    });
  const gridGesture = Gesture.Simultaneous(pinch, Gesture.Native());
  const pinchStyle = useAnimatedStyle(() => ({ transform: [{ scale: pinchScale.value }] }));

  // ── selection
  const exitSelect = () => {
    setSelecting(false);
    setSelected(new Set());
  };
  const onPress = useCallback(
    (cell: Cell) => {
      if (selecting) {
        if (!cell.media) return;
        setSelected((s) => {
          const n = new Set(s);
          n.has(cell.key) ? n.delete(cell.key) : n.add(cell.key);
          return n;
        });
        haptics.tick();
        return;
      }
      setViewerIndex(grid.flat.findIndex((f) => f.key === cell.key));
    },
    [selecting, grid.flat],
  );
  const onLongPress = useCallback(
    (cell: Cell) => {
      if (!cell.media) return;
      haptics.select();
      setSelecting(true);
      setSelected((s) => new Set(s).add(cell.key));
    },
    [],
  );
  const selectedMedia = useMemo(() => grid.flat.filter((f) => f.media && selected.has(f.key)).map((f) => f.media!), [grid.flat, selected]);

  const deleteItems = async (items: Media[]) => {
    const allowed = isOwner ? items : items.filter((m) => m.uploader_id === userId);
    if (!allowed.length) return toast(t('album.deleteOnlyOwn'), { icon: 'info' });
    const ok = await confirm({ title: t('album.deleteConfirmTitle', { count: allowed.length }), message: t('album.deleteConfirmBody'), confirmLabel: t('common.delete'), destructive: true });
    if (!ok) return;
    if (allowed.length < items.length) toast(t('album.deleteOnlyOwn'), { icon: 'info' });
    del.mutate(allowed, { onError: (e) => toast(errorMessage(e), { icon: 'alert', tone: 'danger' }) });
    exitSelect();
  };

  const othersItems = useMemo(() => (media.data ?? []).filter((m) => m.uploader_id !== userId && m.status === 'ready'), [media.data, userId]);
  const saveAllFromOthers = async () => {
    if (!othersItems.length) return toast(t('save.nothingFromOthers'), { icon: 'info' });
    const ok = await confirm({ title: t('album.saveAllFromOthers'), message: t('album.saveAllFromOthersBody', { count: othersItems.length, name: a?.name }), confirmLabel: t('common.save') });
    if (ok) save(othersItems);
  };

  // ── viewer geometry: where is a thumbnail on screen right now?
  const originRect = useCallback(
    (key: string): Rect | null => {
      const pos = grid.position.get(key);
      if (!pos) return null;
      const y = listTop + listHeaderH + rowOffsets[pos.row] - scrollY.current;
      if (y + cellSize < insets.top + TOPBAR_H || y > H) return null;
      return { x: pos.col * (cellSize + GAP), y, width: cellSize, height: cellSize };
    },
    [grid.position, rowOffsets, listHeaderH, cellSize, insets.top, H, listTop],
  );
  // Keep the current photo's thumbnail on screen while paging, so closing lands on it.
  const onViewerIndex = useCallback(
    (key: string) => {
      const pos = grid.position.get(key);
      if (!pos) return;
      const y = listHeaderH + rowOffsets[pos.row];
      const visibleTop = scrollY.current + HEADER_H;
      const visibleBottom = scrollY.current + H - listTop - 120;
      if (y < visibleTop || y + cellSize > visibleBottom) {
        const offset = Math.max(0, y - H / 3);
        listRef.current?.scrollToOffset({ offset, animated: false });
        scrollY.current = offset;
      }
    },
    [grid.position, rowOffsets, listHeaderH, cellSize, insets.top, H],
  );

  const viewerMore = (cell: Cell) => {
    const m = cell.media;
    if (!m) return;
    const mine = m.uploader_id === userId;
    actionSheet({
      title: `${nameFor(m.uploader_id)} · ${formatDateTime(m.captured_at)}`,
      message: `${t('viewer.original', { size: formatBytes(m.size_bytes) })}${m.kind === 'video' ? ` · ${formatDuration(m.duration_ms)}` : ''}`,
      cancelLabel: t('common.cancel'),
      actions: [
        ...(isOwner && m.status === 'ready' ? [{ label: t('viewer.setCover'), icon: 'album' as const, onPress: () => updateAlbum.mutate({ cover_media_id: m.id }, { onSuccess: () => toast(t('viewer.coverSet'), { icon: 'check', tone: 'success' }) }) }] : []),
        ...(isOwner && !mine ? [{ label: m.status === 'hidden' ? t('viewer.unhide') : t('viewer.hide'), icon: (m.status === 'hidden' ? 'eye' : 'eyeOff') as 'eye', onPress: () => setHidden.mutate({ id: m.id, hidden: m.status !== 'hidden' }) }] : []),
        ...(!mine ? [{ label: t('viewer.report'), icon: 'report' as const, onPress: () => reportFlow(m) }] : []),
        ...(mine || isOwner
          ? [{ label: t('viewer.deleteItem'), icon: 'trash' as const, destructive: true, onPress: async () => { setViewerIndex(null); await deleteItems([m]); } }]
          : []),
      ],
    });
  };

  const reportFlow = (m: Media) => {
    const reasons = ['inappropriate', 'violence', 'abuse', 'spam', 'other'] as const;
    actionSheet({
      title: t('report.title'),
      message: t('report.body'),
      cancelLabel: t('common.cancel'),
      actions: reasons.map((r) => ({
        label: t(`report.${r}`),
        onPress: () =>
          reportMedia(m.id, r)
            .then(() => toast(t('report.sent'), { icon: 'checkCircle', tone: 'success' }))
            .catch((e) => toast(errorMessage(e), { icon: 'alert', tone: 'danger' })),
      })),
    });
  };

  // ── rendering
  const labelFor = useCallback(
    (cell: Cell) => {
      const date = formatDateTime(cell.capturedAt);
      const name = cell.media ? nameFor(cell.media.uploader_id) : t('common.you');
      if ((cell.media?.kind ?? cell.upload?.source.kind) === 'video') return t('album.a11yVideo', { name, date, duration: formatDuration(cell.media?.duration_ms) });
      return `${t('album.a11yPhoto', { name, date })}${cell.upload ? `, ${t('album.uploadingItem')}` : ''}`;
    },
    [nameFor, t],
  );

  const renderItem = useCallback(
    ({ item, target }: { item: Row; target?: string }) => {
      if (item.type === 'header') return <DayHeader day={item.day} count={item.count} sticky={target === 'StickyHeader'} />;
      return (
        <View style={[styles.row, { height: cellSize + GAP, gap: GAP }]}>
          {item.cells.map((cell) => (
            <MediaTile
              key={cell.key}
              cell={cell}
              size={cellSize}
              selecting={selecting}
              selected={selected.has(cell.key)}
              fresh={freshIds.has(cell.key)}
              label={labelFor(cell)}
              onPress={onPress}
              onLongPress={onLongPress}
            />
          ))}
        </View>
      );
    },
    [cellSize, selecting, selected, freshIds, labelFor, onPress, onLongPress],
  );

  // ── designed states
  if (album.isError) {
    const code = errorCode(album.error);
    return (
      <View style={[styles.center, { backgroundColor: c.bg }]}>
        <EmptyState icon={code === 'offline' ? 'offline' : 'lock'} tone="warning" title={code === 'offline' ? t('album.errorTitle') : t('join.removedTitle')} body={errorMessage(album.error)}>
          {code === 'offline' ? <Button label={t('common.retry')} variant="secondary" onPress={() => album.refetch()} /> : <Button label={t('join.goHome')} variant="secondary" onPress={() => router.replace('/')} />}
        </EmptyState>
      </View>
    );
  }

  const loading = media.isPending || album.isPending;
  const hasItems = grid.flat.length > 0;
  const totalItems = (media.data?.length ?? 0) + uploads.filter((u) => u.state !== 'done' && u.state !== 'duplicate').length;
  const empty = !loading && totalItems === 0;
  const subtitle = a ? [formatDateRange(a.start_date, a.end_date), t('common.items', { count: media.data?.length ?? 0 })].filter(Boolean).join(' · ') : undefined;

  const freshLabel = (() => {
    if (!fresh.length) return '';
    const uploaders = new Set(fresh.map((f) => f.uploader));
    return uploaders.size === 1 ? t('album.newFrom', { count: fresh.length, name: nameFor(fresh[0].uploader) }) : t('album.newFromMany', { count: fresh.length });
  })();

  const header = (
    <View onLayout={(e) => setListHeaderH(e.nativeEvent.layout.height)} style={{ backgroundColor: c.bg }}>
      {!empty && (contributors.length > 0 || (media.data?.length ?? 0) > 0) && <ContributorFilter value={filter} onChange={setFilter} people={contributors} />}
      <View style={{ paddingHorizontal: space[4], gap: space[3], paddingBottom: space[2] }}>
        {pausedHere && (
          <Banner
            tone="danger"
            icon="uploadOff"
            title={t('album.storageFullTitle')}
            body={isOwner ? t('album.storageFullBody') : t('album.storageFullMemberBody')}
            action={isOwner ? <Button size="sm" variant="tinted" icon="sparkles" label={t('album.seePlans')} onPress={() => router.push({ pathname: '/paywall', params: { albumId: id } })} /> : undefined}
          />
        )}
        {!pausedHere && isOwner && storage.data && ratio >= storage.data.warn_ratio && !storageWarned && (
          <Banner
            tone="warning"
            icon="storage"
            title={t('album.storageWarnTitle')}
            body={t('album.storageWarnBody', { used: formatBytes(storage.data.owner_used_bytes), limit: formatBytes(storage.data.owner_limit_bytes) })}
            onDismiss={() => setPrefs({ storageWarned: { ...usePrefs.getState().storageWarned, [id]: true } })}
            dismissLabel={t('common.notNow')}
            action={<Button size="sm" variant="tinted" label={t('album.seePlans')} onPress={() => router.push('/paywall')} />}
          />
        )}
        {a?.start_date && !suggestionHandled && suggestCount !== 0 && (
          <Banner
            icon="sparkles"
            title={suggestCount ? t('upload.suggestionTitle', { count: suggestCount, range: rangeLabel }) : t('upload.fromDates') + (rangeLabel ? ` · ${rangeLabel}` : '')}
            onDismiss={() => setPrefs({ suggestionHandled: { ...usePrefs.getState().suggestionHandled, [id]: true } })}
            dismissLabel={t('common.notNow')}
            action={<Button size="sm" variant="tinted" icon="addPhoto" label={t('upload.choosePhotos')} onPress={() => router.push({ pathname: '/album/[id]/upload', params: { id, mode: 'range' } })} />}
          />
        )}
        {a?.is_locked && isOwner && (
          <Banner icon="lock" title={t('album.lockedBanner')} />
        )}
      </View>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      {loading ? (
        <View style={{ paddingTop: listTop + space[12] }}>
          <View style={[styles.row, { flexWrap: 'wrap', gap: GAP }]}>
            {Array.from({ length: columns * 6 }, (_, i) => (
              <Skeleton key={i} width={cellSize} height={cellSize} rounded={0} />
            ))}
          </View>
        </View>
      ) : empty ? (
        <View style={[styles.center, { paddingTop: insets.top + TOPBAR_H }]}>
          {header}
          <EmptyState art={<EmptyArt size={140} />} title={t('album.emptyTitle')} body={t('album.emptyBody')}>
            <Button testID="empty-add" label={t('album.add')} icon="addPhoto" onPress={() => router.push(`/album/${id}/upload`)} />
            <Button label={t('album.inviteCta')} icon="userAdd" variant="secondary" onPress={() => router.push(`/album/${id}/share`)} />
          </EmptyState>
        </View>
      ) : (
        <GestureDetector gesture={gridGesture}>
          <Animated.View style={[{ flex: 1, marginTop: listTop }, pinchStyle]}>
            <FlashList
              ref={listRef}
              data={grid.rows}
              renderItem={renderItem}
              keyExtractor={(r) => r.key}
              getItemType={(r) => r.type}
              stickyHeaderIndices={grid.headerIndices}
              ListHeaderComponent={header}
              ListEmptyComponent={
                <EmptyState
                  icon="people"
                  title={t('album.emptyFilteredTitle')}
                  body={t('album.emptyFilteredBody', { name: filter === 'mine' ? t('common.you') : nameFor(filter) })}
                />
              }
              extraData={`${selecting}-${selected.size}-${columns}-${fresh.length}`}
              onScroll={(e: NativeSyntheticEvent<NativeScrollEvent>) => (scrollY.current = e.nativeEvent.contentOffset.y)}
              scrollEventThrottle={16}
              contentContainerStyle={{ paddingBottom: insets.bottom + 120 }}
              drawDistance={H}
              testID="album-grid"
            />
          </Animated.View>
        </GestureDetector>
      )}

      <AlbumTopBar
        albumId={id}
        title={a?.name ?? ''}
        subtitle={subtitle}
        overPhotos={false}
        selecting={selecting}
        selectedLabel={t('album.selectedCount', { count: selected.size })}
        onCancelSelect={exitSelect}
        selectAllLabel={t('common.selectAll')}
        onSelectAll={() => setSelected(new Set(grid.flat.filter((f) => f.media).map((f) => f.key)))}
      />

      {fresh.length > 0 && !selecting && viewerIndex === null && (
        <NewItemsChip
          label={freshLabel}
          top={listTop + 60}
          onPress={() => {
            const pos = grid.position.get(fresh[0].id);
            if (pos) listRef.current?.scrollToOffset({ offset: Math.max(0, listHeaderH + rowOffsets[pos.row] - H / 3), animated: true });
            setFresh([]);
          }}
        />
      )}

      {selecting ? (
        <SelectionBar
          count={selected.size}
          canDelete={isOwner || selectedMedia.some((m) => m.uploader_id === userId)}
          onSave={() => save(selectedMedia).then(exitSelect)}
          onShare={() => share(selectedMedia)}
          onDelete={() => deleteItems(selectedMedia)}
        />
      ) : (
        !empty &&
        !loading && (
          <View style={[styles.bottom, { paddingBottom: Math.max(insets.bottom, space[3]) }]} pointerEvents="box-none">
            <GlassSurface style={styles.bottomBar} interactive>
              <Button testID="album-add" label={t('album.add')} icon="addPhoto" size="md" onPress={() => router.push(`/album/${id}/upload`)} style={{ flex: 1 }} />
              <IconButton icon="download" variant="filled" label={t('album.saveAllFromOthers')} onPress={saveAllFromOthers} testID="save-all-others" />
            </GlassSurface>
          </View>
        )
      )}

      {!selecting && <UploadPill albumId={id} bottom={Math.max(insets.bottom, space[3]) + 70} />}

      {viewerIndex !== null && viewerIndex >= 0 && hasItems && (
        <Viewer
          cells={grid.flat}
          startIndex={viewerIndex}
          originRect={originRect}
          onIndexChange={onViewerIndex}
          onClosed={() => setViewerIndex(null)}
          nameFor={nameFor}
          onAction={(action, cell) => {
            if (!cell.media) return;
            if (action === 'save') save([cell.media]);
            if (action === 'share') share([cell.media]);
            if (action === 'more') viewerMore(cell);
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center' },
  row: { flexDirection: 'row' },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center', paddingHorizontal: layout.gutter },
  bottomBar: { flexDirection: 'row', alignItems: 'center', gap: space[2], padding: space[1.5], borderRadius: radius.xl + 4, width: '100%', maxWidth: 420 },
});
