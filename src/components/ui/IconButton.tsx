import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { useColors } from '@/theme/ThemeProvider';
import { layout, radius, type ColorTokens } from '@/theme/tokens';
import { Icon, type IconName } from './Icon';
import { PressableScale } from './PressableScale';

export function IconButton({
  icon,
  label,
  onPress,
  variant = 'plain',
  color,
  size = 'md',
  disabled,
  style,
  testID,
}: {
  icon: IconName;
  /** Required: every control has a screen-reader label. */
  label: string;
  onPress?: () => void;
  variant?: 'plain' | 'filled' | 'onPhoto' | 'accent';
  color?: keyof ColorTokens;
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const c = useColors();
  const bg =
    variant === 'filled' ? c.surface : variant === 'onPhoto' ? 'rgba(0,0,0,0.38)' : variant === 'accent' ? c.accent : 'transparent';
  const fg = variant === 'onPhoto' ? '#FFFFFF' : variant === 'accent' ? c.onAccent : (c[color ?? 'text'] as string);
  const dim = size === 'lg' ? 52 : layout.minTouch;
  return (
    <PressableScale
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      disabled={disabled}
      scaleTo={0.9}
      hitSlop={4}
      style={[styles.base, { width: dim, height: dim, backgroundColor: bg, opacity: disabled ? 0.4 : 1 }, style]}
    >
      <Icon name={icon} size={size === 'sm' ? 'sm' : size === 'lg' ? 'lg' : 'md'} rawColor={fg} />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill },
});
