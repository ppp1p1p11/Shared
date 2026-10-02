import { StyleSheet, View } from 'react-native';

import { initials } from '@/lib/format';
import { useColors } from '@/theme/ThemeProvider';
import { Text } from './Text';

export function Avatar({
  name,
  color = 0,
  size = 32,
  ring,
}: {
  name: string | null | undefined;
  color?: number;
  size?: number;
  /** Border matching the background, used when avatars overlap. */
  ring?: string;
}) {
  const c = useColors();
  const bg = c.avatar[Math.abs(color) % c.avatar.length];
  return (
    <View
      accessible
      accessibilityLabel={name ?? undefined}
      style={[
        styles.base,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: bg,
          borderWidth: ring ? 2 : 0,
          borderColor: ring,
        },
      ]}
    >
      <Text
        allowFontScaling={false}
        style={{ color: '#FFFFFF', fontSize: size * 0.38, lineHeight: size * 0.46, fontWeight: '600' }}
      >
        {initials(name)}
      </Text>
    </View>
  );
}

export function AvatarStack({
  people,
  max = 4,
  size = 26,
  total,
  ring,
}: {
  people: { id: string; display_name: string; avatar_color: number }[];
  max?: number;
  size?: number;
  total?: number;
  ring: string;
}) {
  const c = useColors();
  const shown = people.slice(0, max);
  const extra = (total ?? people.length) - shown.length;
  return (
    <View style={styles.stack} accessible accessibilityLabel={people.map((p) => p.display_name).join(', ')}>
      {shown.map((p, i) => (
        <View key={p.id} style={{ marginLeft: i === 0 ? 0 : -size * 0.3, zIndex: max - i }}>
          <Avatar name={p.display_name} color={p.avatar_color} size={size} ring={ring} />
        </View>
      ))}
      {extra > 0 && (
        <View
          style={[
            styles.base,
            {
              width: size,
              height: size,
              borderRadius: size / 2,
              marginLeft: -size * 0.3,
              backgroundColor: c.surfacePressed,
              borderWidth: 2,
              borderColor: ring,
            },
          ]}
        >
          <Text allowFontScaling={false} style={{ fontSize: size * 0.36, fontWeight: '600', color: c.textSecondary }}>
            +{extra}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center' },
  stack: { flexDirection: 'row', alignItems: 'center' },
});
