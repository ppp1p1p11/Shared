import { Children, isValidElement, type PropsWithChildren, type ReactNode } from 'react';
import { Pressable, StyleSheet, Switch, View } from 'react-native';

import { useColors } from '@/theme/ThemeProvider';
import { layout, radius, space } from '@/theme/tokens';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';

/** Inset grouped list section (Settings-style). */
export function ListGroup({ title, footer, children }: PropsWithChildren<{ title?: string; footer?: string }>) {
  const c = useColors();
  const rows = Children.toArray(children).filter(isValidElement);
  return (
    <View style={{ gap: space[2] }}>
      {title && (
        <Text variant="footnote" color="textSecondary" weight="600" style={styles.groupTitle} accessibilityRole="header">
          {title}
        </Text>
      )}
      <View style={[styles.group, { backgroundColor: c.surface }]}>
        {rows.map((row, i) => (
          <View key={row.key ?? i}>
            {row}
            {i < rows.length - 1 && <View style={[styles.sep, { backgroundColor: c.separator }]} />}
          </View>
        ))}
      </View>
      {footer && (
        <Text variant="footnote" color="textTertiary" style={styles.groupTitle}>
          {footer}
        </Text>
      )}
    </View>
  );
}

export type ListRowProps = {
  title: string;
  subtitle?: string;
  value?: string;
  icon?: IconName;
  iconColor?: string;
  leading?: ReactNode;
  onPress?: () => void;
  destructive?: boolean;
  chevron?: boolean;
  checked?: boolean;
  toggle?: { value: boolean; onChange: (v: boolean) => void; disabled?: boolean };
  trailing?: ReactNode;
  disabled?: boolean;
  testID?: string;
};

export function ListRow({
  title,
  subtitle,
  value,
  icon,
  iconColor,
  leading,
  onPress,
  destructive,
  chevron,
  checked,
  toggle,
  trailing,
  disabled,
  testID,
}: ListRowProps) {
  const c = useColors();
  const interactive = !!onPress && !disabled;
  const content = (
    <View style={[styles.row, { opacity: disabled ? 0.45 : 1 }]}>
      {leading}
      {icon && !leading && (
        <View style={[styles.iconWell, { backgroundColor: destructive ? c.dangerSoft : c.accentSoft }]}>
          <Icon name={icon} size="sm" rawColor={iconColor ?? (destructive ? c.danger : c.accent)} />
        </View>
      )}
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="body" color={destructive ? 'danger' : 'text'}>
          {title}
        </Text>
        {subtitle && (
          <Text variant="footnote" color="textSecondary">
            {subtitle}
          </Text>
        )}
      </View>
      {value && (
        <Text variant="body" color="textSecondary" numberOfLines={1} style={{ maxWidth: '45%' }}>
          {value}
        </Text>
      )}
      {trailing}
      {checked !== undefined && (checked ? <Icon name="check" color="accent" /> : <View style={{ width: 22 }} />)}
      {toggle && (
        <Switch
          value={toggle.value}
          onValueChange={toggle.onChange}
          disabled={toggle.disabled}
          trackColor={{ true: c.accent, false: c.surfacePressed }}
          thumbColor="#FFFFFF"
          ios_backgroundColor={c.surfacePressed}
          accessibilityLabel={title}
        />
      )}
      {chevron && <Icon name="chevron" size="sm" color="textTertiary" />}
    </View>
  );
  if (!interactive) {
    return (
      <View testID={testID} accessible={!toggle} accessibilityLabel={[title, subtitle, value].filter(Boolean).join(', ')}>
        {content}
      </View>
    );
  }
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole={checked !== undefined ? 'radio' : 'button'}
      accessibilityState={checked !== undefined ? { checked } : undefined}
      accessibilityLabel={[title, value].filter(Boolean).join(', ')}
      accessibilityHint={subtitle}
      style={({ pressed }) => ({ backgroundColor: pressed ? c.surfacePressed : 'transparent' })}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  group: { borderRadius: radius.lg, overflow: 'hidden' },
  groupTitle: { paddingHorizontal: space[4], textTransform: 'none' },
  row: {
    minHeight: layout.minTouch + 8,
    paddingHorizontal: space[4],
    paddingVertical: space[3],
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
  },
  iconWell: { width: 30, height: 30, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  sep: { height: StyleSheet.hairlineWidth, marginLeft: space[4] },
});
