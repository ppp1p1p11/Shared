import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { EmptyArt } from '@/components/ui/EmptyArt';
import { useColors } from '@/theme/ThemeProvider';
import { radius } from '@/theme/tokens';

/**
 * What non-members see: only the colours of up to four photos (thumbhashes), never the pixels.
 * The real photos load only after joining, because storage RLS won't serve them before that.
 */
export function BlurredPreview({ hashes, size }: { hashes: string[]; size: number }) {
  const c = useColors();
  if (!hashes.length) return <EmptyArt size={size * 0.62} />;
  const tiles = hashes.slice(0, 4);
  const cols = tiles.length === 1 ? 1 : 2;
  const rows = tiles.length <= 2 ? 1 : 2;
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.wrap, { width: size, height: size * (rows === 1 && cols === 2 ? 0.6 : 1), backgroundColor: c.surface }]}
    >
      {tiles.map((h, i) => (
        <Image
          key={i}
          placeholder={{ thumbhash: h }}
          placeholderContentFit="cover"
          style={{ width: `${100 / cols}%`, height: `${100 / rows}%` }}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', borderRadius: radius.xxl, overflow: 'hidden' },
});
