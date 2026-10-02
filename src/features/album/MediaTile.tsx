import { memo, useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { MediaImage } from '@/components/media/MediaImage';
import { Icon } from '@/components/ui/Icon';
import { ProgressRing } from '@/components/ui/ProgressRing';
import { Text } from '@/components/ui/Text';
import { mediaOps } from '@/features/upload/mediaOps';
import { formatDuration } from '@/lib/format';
import { useColors } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';
import type { Cell } from '@/features/media/grid';

type Props = {
  cell: Cell;
  size: number;
  selecting: boolean;
  selected: boolean;
  fresh: boolean;
  label: string;
  onPress: (cell: Cell) => void;
  onLongPress: (cell: Cell) => void;
};

export const MediaTile = memo(function MediaTile({ cell, size, selecting, selected, fresh, label, onPress, onLongPress }: Props) {
  const c = useColors();
  const m = cell.media;
  const u = cell.upload;
  const appear = useSharedValue(fresh ? 0 : 1);
  useEffect(() => {
    if (fresh) appear.value = withTiming(1, { duration: 450 });
  }, [fresh, appear]);
  const appearStyle = useAnimatedStyle(() => ({ opacity: appear.value, transform: [{ scale: 0.94 + 0.06 * appear.value }] }));

  const kind = m?.kind ?? u?.source.kind;
  const duration = m?.duration_ms ?? u?.staged?.durationMs ?? u?.source.durationMs;
  const progress = u ? (u.bytesTotal ? u.bytesSent / u.bytesTotal : 0) : 1;
  const compact = size < 70;

  return (
    <Pressable
      onPress={() => onPress(cell)}
      onLongPress={() => onLongPress(cell)}
      delayLongPress={280}
      accessibilityRole="imagebutton"
      accessibilityLabel={label}
      accessibilityState={selecting ? { selected } : undefined}
      style={{ width: size, height: size }}
    >
      <Animated.View style={[StyleSheet.absoluteFill, appearStyle]}>
        {m ? (
          <MediaImage path={m.thumb_path} thumbhash={m.thumbhash} recyclingKey={m.id} style={StyleSheet.absoluteFill} transition={120} />
        ) : u ? (
          <MediaImage localUri={mediaOps.previewUri(u)} thumbhash={u.staged?.thumbhash} recyclingKey={u.id} style={StyleSheet.absoluteFill} transition={0} />
        ) : null}
      </Animated.View>

      {kind === 'video' && !compact && (
        <View style={styles.bottomRight}>
          <Icon name="play" size={10} rawColor="#FFF" strokeWidth={2.5} />
          <Text variant="caption" style={styles.badgeText} tabular>
            {formatDuration(duration)}
          </Text>
        </View>
      )}
      {m?.live_photo_video_path && !compact && (
        <View style={styles.topLeft}>
          <Icon name="aperture" size={14} rawColor="#FFF" strokeWidth={2} />
        </View>
      )}
      {m?.status === 'hidden' && (
        <View style={[StyleSheet.absoluteFill, styles.center, { backgroundColor: 'rgba(0,0,0,0.45)' }]}>
          <Icon name="eyeOff" size={compact ? 14 : 20} rawColor="#FFF" />
        </View>
      )}
      {u && (
        <View style={[StyleSheet.absoluteFill, styles.center, { backgroundColor: 'rgba(0,0,0,0.28)' }]}>
          {u.state === 'paused_quota' ? (
            <Icon name="uploadOff" size={compact ? 14 : 20} rawColor="#FFF" />
          ) : (
            <ProgressRing progress={progress} size={compact ? 16 : 24} color="#FFFFFF" track="rgba(255,255,255,0.35)" />
          )}
        </View>
      )}
      {selecting && (
        <View style={[StyleSheet.absoluteFill, selected && { backgroundColor: 'rgba(255,255,255,0.18)' }]}>
          <View style={[styles.check, selected ? { backgroundColor: c.accent, borderColor: '#FFF' } : { borderColor: '#FFF', backgroundColor: 'rgba(0,0,0,0.2)' }]}>
            {selected && <Icon name="check" size={13} rawColor={c.onAccent} strokeWidth={3} />}
          </View>
        </View>
      )}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  bottomRight: { position: 'absolute', right: 5, bottom: 4, flexDirection: 'row', alignItems: 'center', gap: 3 },
  topLeft: { position: 'absolute', left: 5, top: 5 },
  badgeText: { color: '#FFF', textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 3, textShadowOffset: { width: 0, height: 0 } },
  check: { position: 'absolute', right: 6, bottom: 6, width: 24, height: 24, borderRadius: radius.pill, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
});

export const tileSpacing = { gap: 2, headerHeight: 44, chipRow: space[12] };
