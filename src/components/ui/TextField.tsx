import { forwardRef, useState } from 'react';
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { useColors } from '@/theme/ThemeProvider';
import { radius, space, type as typeScale } from '@/theme/tokens';
import { Text } from './Text';

export type TextFieldProps = TextInputProps & {
  label?: string;
  hint?: string;
  error?: string | null;
  size?: 'lg' | 'md';
  trailing?: React.ReactNode;
};

export const TextField = forwardRef<TextInput, TextFieldProps>(function TextField(
  { label, hint, error, size = 'md', trailing, style, onFocus, onBlur, ...rest },
  ref,
) {
  const c = useColors();
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ gap: space[2] }}>
      {label && (
        <Text variant="footnote" color="textSecondary" weight="500" nativeID={`${label}-label`}>
          {label}
        </Text>
      )}
      <View
        style={[
          styles.box,
          {
            backgroundColor: c.surface,
            borderColor: error ? c.danger : focused ? c.accent : 'transparent',
            minHeight: size === 'lg' ? 60 : 50,
          },
        ]}
      >
        <TextInput
          ref={ref}
          placeholderTextColor={c.textTertiary}
          selectionColor={c.accent}
          accessibilityLabel={label ?? rest.placeholder}
          accessibilityLabelledBy={label ? `${label}-label` : undefined}
          maxFontSizeMultiplier={1.6}
          {...rest}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          style={[
            size === 'lg' ? typeScale.title3 : typeScale.body,
            { color: c.text, flex: 1, paddingVertical: space[3], outlineStyle: 'none' } as any,
            style,
          ]}
        />
        {trailing}
      </View>
      {(error || hint) && (
        <Text variant="footnote" color={error ? 'danger' : 'textTertiary'} accessibilityLiveRegion={error ? 'polite' : 'none'}>
          {error || hint}
        </Text>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: 1.5,
    paddingHorizontal: space[4],
    gap: space[2],
  },
});
