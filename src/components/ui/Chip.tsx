import { StyleSheet, View } from 'react-native';

import { useColors } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';
import { PressableScale } from './PressableScale';
import { Text } from './Text';

export function Chip({
  label,
  selected,
  onPress,
  leading,
  onPhoto,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  leading?: React.ReactNode;
  onPhoto?: boolean;
}) {
  const c = useColors();
  const bg = selected ? c.text : onPhoto ? 'rgba(0,0,0,0.4)' : c.surface;
  const fg = selected ? c.bg : onPhoto ? '#FFFFFF' : c.text;
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: !!selected }}
      accessibilityLabel={label}
      scaleTo={0.95}
      style={[styles.chip, { backgroundColor: bg }]}
    >
      <View style={styles.row}>
        {leading}
        <Text variant="subhead" weight={selected ? '600' : '500'} style={{ color: fg }} numberOfLines={1}>
          {label}
        </Text>
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  chip: { minHeight: 36, paddingHorizontal: space[3] + 2, borderRadius: radius.pill, justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space[1.5] },
});
