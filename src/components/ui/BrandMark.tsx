import { View } from 'react-native';

/** Rolo mark: a film-roll spool in a rounded square. Pure views, crisp at any size. */
export function BrandMark({ size = 40, bg = '#CC3D25', fg = '#FFFFFF' }: { size?: number; bg?: string; fg?: string }) {
  const ring = size * 0.56;
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ width: size, height: size, borderRadius: size * 0.28, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}
    >
      <View style={{ width: ring, height: ring, borderRadius: ring / 2, borderWidth: size * 0.09, borderColor: fg, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ width: size * 0.14, height: size * 0.14, borderRadius: size, backgroundColor: fg }} />
      </View>
    </View>
  );
}
