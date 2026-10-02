import { useEffect, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';

import { haptics } from '@/lib/haptics';
import { useMotion } from '@/theme/motion';
import { useColors } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';
import { PressableScale } from './PressableScale';
import { Text } from './Text';

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  const c = useColors();
  const { spring } = useMotion();
  const [width, setWidth] = useState(0);
  const idx = Math.max(0, options.findIndex((o) => o.value === value));
  const segW = width / options.length;
  const x = useSharedValue(0);
  useEffect(() => {
    x.value = spring(idx * segW);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, segW]);
  const thumb = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  return (
    <View
      accessibilityRole="tablist"
      onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width - 4)}
      style={[styles.track, { backgroundColor: c.surface }]}
    >
      {width > 0 && (
        <Animated.View style={[styles.thumb, { width: segW, backgroundColor: c.surfaceRaised, borderColor: c.border }, thumb]} />
      )}
      {options.map((o) => (
        <PressableScale
          key={o.value}
          accessibilityRole="tab"
          accessibilityState={{ selected: o.value === value }}
          accessibilityLabel={o.label}
          onPress={() => {
            if (o.value !== value) haptics.tick();
            onChange(o.value);
          }}
          style={styles.seg}
        >
          <Text variant="subhead" weight={o.value === value ? '600' : '500'} color={o.value === value ? 'text' : 'textSecondary'} numberOfLines={1}>
            {o.label}
          </Text>
        </PressableScale>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { flexDirection: 'row', borderRadius: radius.md, padding: 2, minHeight: 40 },
  thumb: { position: 'absolute', top: 2, bottom: 2, left: 2, borderRadius: radius.md - 2, borderWidth: StyleSheet.hairlineWidth },
  seg: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space[2], minHeight: 36 },
});
