import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler, FlatList, Platform, StyleSheet, View, useWindowDimensions, type ViewToken } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Image } from 'expo-image';
import Animated, {
  FadeIn,
  FadeOut,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { MediaImage } from '@/components/media/MediaImage';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { Text } from '@/components/ui/Text';
import type { Cell } from '@/features/media/grid';
import { mediaOps } from '@/features/upload/mediaOps';
import { formatDateTime } from '@/lib/format';
import { useMediaSource } from '@/lib/storage/useMediaSource';
import { motion, space } from '@/theme/tokens';
import { LiveMotion, VideoPage } from './VideoPage';
import { ZoomableImage } from './ZoomableImage';

export type Rect = { x: number; y: number; width: number; height: number };

export type ViewerAction = 'save' | 'share' | 'more';

type Props = {
  cells: Cell[];
  startIndex: number;
  /** Where the thumbnail for `key` is on screen right now (null if scrolled off). */
  originRect: (key: string) => Rect | null;
  onIndexChange?: (key: string) => void;
  onClosed: () => void;
  nameFor: (uploaderId: string) => string;
  onAction: (action: ViewerAction, cell: Cell) => void;
};

function fitRect(w: number | null | undefined, h: number | null | undefined, W: number, H: number): Rect {
  const iw = w || W;
  const ih = h || W;
  const s = Math.min(W / iw, H / ih);
  const fw = iw * s;
  const fh = ih * s;
  return { x: (W - fw) / 2, y: (H - fh) / 2, width: fw, height: fh };
}

const dims = (c: Cell) => ({ w: c.media?.width ?? c.upload?.staged?.width ?? c.upload?.source.width, h: c.media?.height ?? c.upload?.staged?.height ?? c.upload?.source.height });

export function Viewer({ cells, startIndex, originRect, onIndexChange, onClosed, nameFor, onAction }: Props) {
  const { t } = useTranslation();
  const { width: W, height: H } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const [index, setIndex] = useState(startIndex);
  const [phase, setPhase] = useState<'opening' | 'open' | 'closing'>(reduced ? 'open' : 'opening');
  const [chrome, setChrome] = useState(true);
  const [zoomed, setZoomed] = useState(false);
  const [livePlaying, setLivePlaying] = useState(false);
  const listRef = useRef<FlatList<Cell>>(null);

  const cell = cells[index] ?? cells[0];
  // Rects live in shared values so the UI-thread worklet sees updates made on close.
  const initialFrom = originRect(cells[startIndex]?.key);
  const hasFrom = useSharedValue(initialFrom ? 1 : 0);
  const from = useSharedValue<Rect>(initialFrom ?? { x: 0, y: 0, width: 0, height: 0 });
  const to = useSharedValue<Rect>(fitRect(dims(cells[startIndex]).w, dims(cells[startIndex]).h, W, H));

  // Shared values: open/close progress, background, dismiss drag.
  const progress = useSharedValue(reduced ? 1 : 0);
  const bg = useSharedValue(reduced ? 1 : 0);
  const dragY = useSharedValue(0);
  const dragX = useSharedValue(0);

  useEffect(() => {
    if (reduced) return;
    progress.value = withSpring(1, motion.spring.viewer, (done) => done && runOnJS(setPhase)('open'));
    bg.value = withTiming(1, { duration: 220 });
  }, [reduced, progress, bg]);

  const close = useCallback(() => {
    const key = cells[index]?.key;
    const origin = key ? originRect(key) : null;
    const d = dims(cells[index]);
    // Start the reverse transition from wherever the photo currently is (including the drag offset).
    const current = fitRect(d.w, d.h, W, H);
    const s = 1 - Math.min(0.35, Math.abs(dragY.value) / H);
    to.value = { x: current.x + dragX.value + (current.width * (1 - s)) / 2, y: current.y + dragY.value + (current.height * (1 - s)) / 2, width: current.width * s, height: current.height * s };
    if (origin) from.value = origin;
    hasFrom.value = origin ? 1 : 0;
    dragX.value = 0;
    dragY.value = 0;
    setPhase('closing');
    if (reduced || !origin) {
      bg.value = withTiming(0, { duration: 160 });
      progress.value = withTiming(0, { duration: 180 }, () => runOnJS(onClosed)());
      return;
    }
    bg.value = withTiming(0, { duration: 260 });
    progress.value = withSpring(0, { ...motion.spring.viewer, overshootClamping: true }, (done) => done && runOnJS(onClosed)());
  }, [cells, index, originRect, W, H, reduced, bg, progress, dragX, dragY, onClosed, to, from, hasFrom]);

  // Android back / web Escape close the viewer.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      close();
      return true;
    });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      if (e.key === 'ArrowRight') listRef.current?.scrollToIndex({ index: Math.min(cells.length - 1, index + 1) });
      if (e.key === 'ArrowLeft') listRef.current?.scrollToIndex({ index: Math.max(0, index - 1) });
    };
    if (Platform.OS === 'web') window.addEventListener('keydown', onKey);
    return () => {
      sub.remove();
      if (Platform.OS === 'web') window.removeEventListener('keydown', onKey);
    };
  }, [close, cells.length, index]);

  // Swipe down (or up) to dismiss.
  const dismiss = Gesture.Pan()
    .enabled(!zoomed && phase === 'open')
    .activeOffsetY([-14, 14])
    .failOffsetX([-22, 22])
    .onUpdate((e) => {
      dragY.value = e.translationY;
      dragX.value = e.translationX * 0.6;
      bg.value = 1 - Math.min(1, Math.abs(e.translationY) / (H * 0.55));
    })
    .onEnd((e) => {
      if (Math.abs(e.translationY) > 110 || Math.abs(e.velocityY) > 900) {
        runOnJS(close)();
      } else {
        dragY.value = withSpring(0, motion.spring.snappy);
        dragX.value = withSpring(0, motion.spring.snappy);
        bg.value = withTiming(1, { duration: 160 });
      }
    });

  const bgStyle = useAnimatedStyle(() => ({ opacity: bg.value }));
  const pagerStyle = useAnimatedStyle(() => {
    const s = 1 - Math.min(0.35, Math.abs(dragY.value) / H);
    return { transform: [{ translateX: dragX.value }, { translateY: dragY.value }, { scale: s }] };
  });

  // Transition image (only during open/close): interpolates thumbnail rect ↔ fitted rect.
  const transitionStyle = useAnimatedStyle(() => {
    const b = to.value;
    const a = hasFrom.value ? from.value : { x: b.x + b.width * 0.1, y: b.y + b.height * 0.1, width: b.width * 0.8, height: b.height * 0.8 };
    const p = progress.value;
    return {
      left: interpolate(p, [0, 1], [a.x, b.x]),
      top: interpolate(p, [0, 1], [a.y, b.y]),
      width: interpolate(p, [0, 1], [a.width, b.width]),
      height: interpolate(p, [0, 1], [a.height, b.height]),
      opacity: hasFrom.value ? 1 : p,
    };
  });

  const onViewable = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    const first = viewableItems.find((v) => v.isViewable);
    if (first?.index != null) {
      setIndex(first.index);
      setLivePlaying(false);
    }
  }).current;

  useEffect(() => {
    if (cell) onIndexChange?.(cell.key);
  }, [cell, onIndexChange]);

  const tCell = cells[index];
  const uploader = tCell?.media ? nameFor(tCell.media.uploader_id) : t('common.you');
  const capturedAt = tCell?.media?.captured_at ?? tCell?.upload?.staged?.capturedAt ?? tCell?.upload?.source.capturedAt;

  const renderPage = useCallback(
    ({ item, index: i }: { item: Cell; index: number }) => <Page cell={item} active={i === index && phase === 'open'} W={W} H={H} onZoomChange={setZoomed} onTap={() => setChrome((v) => !v)} livePlaying={i === index && livePlaying} setLivePlaying={setLivePlaying} />,
    [index, phase, W, H, livePlaying],
  );

  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 100, elevation: 100 }]} accessibilityViewIsModal>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: '#000' }, bgStyle]} />

      <GestureDetector gesture={dismiss}>
        <Animated.View style={[StyleSheet.absoluteFill, pagerStyle, { opacity: phase === 'open' ? 1 : 0 }]}>
          <FlatList
            ref={listRef}
            data={cells}
            keyExtractor={(c) => c.key}
            horizontal
            pagingEnabled
            scrollEnabled={!zoomed}
            initialScrollIndex={startIndex}
            getItemLayout={(_d, i) => ({ length: W, offset: W * i, index: i })}
            renderItem={renderPage}
            windowSize={3}
            initialNumToRender={1}
            maxToRenderPerBatch={2}
            showsHorizontalScrollIndicator={false}
            onViewableItemsChanged={onViewable}
            viewabilityConfig={{ itemVisiblePercentThreshold: 60 }}
            extraData={`${index}-${phase}-${livePlaying}`}
          />
        </Animated.View>
      </GestureDetector>

      {phase !== 'open' && tCell && (
        <Animated.View pointerEvents="none" style={[{ position: 'absolute', overflow: 'hidden' }, transitionStyle]}>
          <TransitionContent cell={phase === 'opening' ? cells[startIndex] : tCell} />
        </Animated.View>
      )}

      {chrome && phase === 'open' && tCell && (
        <>
          <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(140)} style={[styles.top, { paddingTop: insets.top + space[1] }]}>
            <IconButton icon="close" variant="onPhoto" label={t('viewer.close')} onPress={close} testID="viewer-close" />
            <View style={{ flex: 1, alignItems: 'center' }}>
              <Text variant="subhead" weight="600" style={styles.onPhoto} numberOfLines={1}>
                {uploader}
              </Text>
              {capturedAt && (
                <Text variant="caption" style={[styles.onPhoto, { opacity: 0.8 }]}>
                  {formatDateTime(capturedAt)}
                </Text>
              )}
            </View>
            <IconButton icon="more" variant="onPhoto" label={t('common.more')} onPress={() => onAction('more', tCell)} testID="viewer-more" />
          </Animated.View>
          <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(140)} style={[styles.bottom, { paddingBottom: insets.bottom + space[3] }]}>
            {tCell.media?.status === 'hidden' && (
              <View style={styles.hint}>
                <Icon name="eyeOff" size={14} rawColor="#FFF" />
                <Text variant="caption" style={styles.onPhoto}>
                  {t('viewer.hiddenBadge')}
                </Text>
              </View>
            )}
            {tCell.media?.live_photo_video_path && (
              <View style={styles.hint}>
                <Icon name="aperture" size={14} rawColor="#FFF" />
                <Text variant="caption" style={styles.onPhoto}>
                  {t('viewer.livePhotoHint')}
                </Text>
              </View>
            )}
            <View style={styles.actions}>
              <Button size="md" variant="onPhoto" icon="download" label={t('viewer.save')} onPress={() => onAction('save', tCell)} disabled={!tCell.media} testID="viewer-save" />
              <Button size="md" variant="onPhoto" icon="share" label={t('viewer.shareItem')} onPress={() => onAction('share', tCell)} disabled={!tCell.media} />
            </View>
          </Animated.View>
        </>
      )}
    </View>
  );
}

function TransitionContent({ cell }: { cell?: Cell }) {
  if (!cell) return null;
  if (cell.media) return <MediaImage path={cell.media.thumb_path} thumbhash={cell.media.thumbhash} style={StyleSheet.absoluteFill} transition={0} priority="high" />;
  if (cell.upload) return <MediaImage localUri={mediaOps.previewUri(cell.upload)} style={StyleSheet.absoluteFill} transition={0} />;
  return null;
}

function Page({
  cell,
  active,
  W,
  H,
  onZoomChange,
  onTap,
  livePlaying,
  setLivePlaying,
}: {
  cell: Cell;
  active: boolean;
  W: number;
  H: number;
  onZoomChange: (z: boolean) => void;
  onTap: () => void;
  livePlaying: boolean;
  setLivePlaying: (v: boolean) => void;
}) {
  const m = cell.media;
  const d = dims(cell);
  const rect = fitRect(d.w, d.h, W, H);
  const thumb = useMediaSource(m?.thumb_path);
  const kind = m?.kind ?? cell.upload?.source.kind;

  if (kind === 'video') {
    return (
      <View style={{ width: W, height: H, justifyContent: 'center' }}>
        <View style={{ position: 'absolute', left: rect.x, top: rect.y, width: rect.width, height: rect.height }}>
          <MediaImage path={m?.preview_path ?? m?.thumb_path} thumbhash={m?.thumbhash} localUri={cell.upload ? mediaOps.previewUri(cell.upload) : null} style={StyleSheet.absoluteFill} contentFit="contain" />
        </View>
        {active && <VideoPage path={m?.storage_path} localUri={cell.upload?.staged?.originalUri ?? null} active={active} width={W} height={H} />}
      </View>
    );
  }

  return (
    <ZoomableImage
      width={W}
      height={H}
      active={active}
      onZoomChange={onZoomChange}
      onSingleTap={onTap}
      onLongPressIn={m?.live_photo_video_path ? () => setLivePlaying(true) : undefined}
      onLongPressOut={m?.live_photo_video_path ? () => setLivePlaying(false) : undefined}
    >
      <View style={{ position: 'absolute', left: rect.x, top: rect.y, width: rect.width, height: rect.height }}>
        {m ? (
          <PreviewImage path={m.preview_path ?? m.thumb_path} thumb={thumb} thumbhash={m.thumbhash} />
        ) : cell.upload ? (
          <MediaImage localUri={mediaOps.previewUri(cell.upload)} style={StyleSheet.absoluteFill} contentFit="contain" transition={0} />
        ) : null}
        {m?.live_photo_video_path && <LiveMotion path={m.live_photo_video_path} playing={livePlaying} />}
      </View>
    </ZoomableImage>
  );
}

/** The 1600px preview, with the already-cached grid thumbnail as its placeholder (no flash). */
function PreviewImage({ path, thumb, thumbhash }: { path: string | null; thumb: ReturnType<typeof useMediaSource>; thumbhash: string | null }) {
  const src = useMediaSource(path);
  return (
    <Image
      source={src}
      placeholder={thumb ?? (thumbhash ? { thumbhash } : undefined)}
      placeholderContentFit="contain"
      contentFit="contain"
      transition={{ duration: 160, effect: 'cross-dissolve', timing: 'ease-out' }}
      cachePolicy="memory-disk"
      loading="eager"
      style={StyleSheet.absoluteFill}
      priority="high"
    />
  );
}

const styles = StyleSheet.create({
  top: { position: 'absolute', left: 0, right: 0, top: 0, flexDirection: 'row', alignItems: 'center', paddingHorizontal: space[3], gap: space[2] },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center', gap: space[3] },
  actions: { flexDirection: 'row', gap: space[3] },
  hint: { flexDirection: 'row', alignItems: 'center', gap: space[1.5], backgroundColor: 'rgba(0,0,0,0.4)', paddingHorizontal: space[3], paddingVertical: space[1], borderRadius: 999 },
  onPhoto: { color: '#FFFFFF', textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 4, textShadowOffset: { width: 0, height: 0 } },
});
