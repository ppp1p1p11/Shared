import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { formatBytes } from '@/lib/format';
import { useColors } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';
import { Text } from './Text';

/** "Búzios 2026 · 11.2 GB of 15 GB" with a calm bar that turns amber at the warn ratio. */
export function UsageBar({
  label,
  used,
  limit,
  warnRatio = 0.8,
  caption,
}: {
  label?: string;
  used: number;
  limit: number;
  warnRatio?: number;
  caption?: string;
}) {
  const c = useColors();
  const ratio = limit > 0 ? Math.min(1, used / limit) : 0;
  const color = ratio >= 1 ? c.danger : ratio >= warnRatio ? c.warning : c.accent;
  const w = useSharedValue(0);
  useEffect(() => {
    w.value = withTiming(ratio, { duration: 600 });
  }, [ratio, w]);
  const fill = useAnimatedStyle(() => ({ width: `${Math.max(w.value * 100, ratio > 0 ? 1.5 : 0)}%` }));
  const usage = `${formatBytes(used)} / ${formatBytes(limit)}`;
  return (
    <View
      style={{ gap: space[2] }}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={[label, usage].filter(Boolean).join(', ')}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(ratio * 100) }}
    >
      <View style={styles.labels}>
        {label && (
          <Text variant="subhead" weight="600" numberOfLines={1} style={{ flex: 1 }}>
            {label}
          </Text>
        )}
        <Text variant="subhead" color="textSecondary" tabular>
          {usage}
        </Text>
      </View>
      <View style={[styles.track, { backgroundColor: c.surfacePressed }]}>
        <Animated.View style={[styles.fill, { backgroundColor: color }, fill]} />
      </View>
      {caption && (
        <Text variant="footnote" color="textTertiary">
          {caption}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  labels: { flexDirection: 'row', alignItems: 'baseline', gap: space[2] },
  track: { height: 8, borderRadius: radius.pill, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: radius.pill },
});
