import { StyleSheet } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';

import { Icon } from '@/components/ui/Icon';
import { PressableScale } from '@/components/ui/PressableScale';
import { Text } from '@/components/ui/Text';
import { useColors } from '@/theme/ThemeProvider';
import { elevation, radius, space } from '@/theme/tokens';

/** "12 new from Ana": a calm chip, never a badge. */
/** Sits in the thumb zone, above the upload pill. */
export function NewItemsChip({ label, bottom, onPress }: { label: string; bottom: number; onPress: () => void }) {
  const c = useColors();
  return (
    <Animated.View entering={FadeInDown.springify().damping(18)} exiting={FadeOutDown.duration(160)} style={[styles.wrap, { bottom }]} pointerEvents="box-none">
      <PressableScale onPress={onPress} accessibilityRole="button" accessibilityLabel={label} accessibilityLiveRegion="polite" style={[styles.chip, elevation.floating, { backgroundColor: c.accent }]}>
        <Icon name="sparkles" size={16} rawColor={c.onAccent} strokeWidth={2.25} />
        <Text variant="subhead" weight="600" style={{ color: c.onAccent }}>
          {label}
        </Text>
      </PressableScale>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 20 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: space[1.5], paddingHorizontal: space[4], paddingVertical: space[2], borderRadius: radius.pill, minHeight: 40 },
});
