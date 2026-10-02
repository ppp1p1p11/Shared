import { ActivityIndicator, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useColors } from '@/theme/ThemeProvider';
import { layout, radius, space } from '@/theme/tokens';
import { Icon, type IconName } from './Icon';
import { PressableScale } from './PressableScale';
import { Text } from './Text';

type Variant = 'primary' | 'secondary' | 'ghost' | 'destructive' | 'onPhoto';

export type ButtonProps = {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  size?: 'lg' | 'md' | 'sm';
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityHint?: string;
  testID?: string;
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'lg',
  icon,
  loading,
  disabled,
  fullWidth,
  style,
  accessibilityHint,
  testID,
}: ButtonProps) {
  const c = useColors();
  const palette: Record<Variant, { bg: string; fg: keyof typeof c }> = {
    primary: { bg: c.accent, fg: 'onAccent' },
    secondary: { bg: c.surface, fg: 'text' },
    ghost: { bg: 'transparent', fg: 'accent' },
    destructive: { bg: c.dangerSoft, fg: 'danger' },
    onPhoto: { bg: 'rgba(255,255,255,0.18)', fg: 'textInverse' },
  };
  const p = palette[variant];
  const height = size === 'lg' ? 54 : size === 'md' ? 46 : 36;
  const isDisabled = disabled || loading;
  const fgColor = variant === 'onPhoto' ? '#FFFFFF' : (c[p.fg] as string);

  return (
    <PressableScale
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!isDisabled, busy: !!loading }}
      onPress={onPress}
      disabled={isDisabled}
      hitSlop={size === 'sm' ? 6 : 0}
      style={[
        styles.base,
        {
          backgroundColor: p.bg,
          minHeight: Math.max(height, size === 'sm' ? 36 : layout.minTouch),
          paddingHorizontal: size === 'sm' ? space[3] : space[5],
          borderRadius: size === 'sm' ? radius.pill : radius.lg,
          opacity: disabled && !loading ? 0.45 : 1,
        },
        fullWidth && { alignSelf: 'stretch' },
        style,
      ]}
    >
      <View style={styles.row}>
        {loading ? (
          <ActivityIndicator color={fgColor} />
        ) : (
          <>
            {icon && <Icon name={icon} size={size === 'sm' ? 'sm' : 'md'} rawColor={fgColor} />}
            <Text
              variant={size === 'sm' ? 'subhead' : 'headline'}
              weight="600"
              style={{ color: fgColor }}
              numberOfLines={1}
            >
              {label}
            </Text>
          </>
        )}
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
});
