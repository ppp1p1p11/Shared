import { Text as RNText, type TextProps as RNTextProps } from 'react-native';

import { useColors } from '@/theme/ThemeProvider';
import { type as typeScale, type ColorTokens, type TypeVariant } from '@/theme/tokens';

type ColorName = 'text' | 'textSecondary' | 'textTertiary' | 'accent' | 'danger' | 'success' | 'warning' | 'onAccent' | 'textInverse';

export type TextProps = RNTextProps & {
  variant?: TypeVariant;
  color?: ColorName;
  align?: 'left' | 'center' | 'right';
  weight?: '400' | '500' | '600' | '700';
  tabular?: boolean;
};

/** All text in the app. Supports Dynamic Type (capped so layouts stay intact). */
export function Text({ variant = 'body', color = 'text', align, weight, tabular, style, ...rest }: TextProps) {
  const colors = useColors();
  return (
    <RNText
      maxFontSizeMultiplier={variant === 'display' || variant === 'title1' ? 1.4 : 1.8}
      {...rest}
      style={[
        typeScale[variant],
        { color: colors[color as keyof ColorTokens] as string },
        align && { textAlign: align },
        weight && { fontWeight: weight },
        tabular && { fontVariant: ['tabular-nums'] },
        style,
      ]}
    />
  );
}
