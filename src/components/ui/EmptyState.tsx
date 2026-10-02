import { type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { useColors } from '@/theme/ThemeProvider';
import { layout, radius, space } from '@/theme/tokens';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';

export function EmptyState({
  icon,
  art,
  title,
  body,
  tone = 'neutral',
  children,
}: {
  icon?: IconName;
  art?: ReactNode;
  title: string;
  body?: string;
  tone?: 'neutral' | 'danger' | 'warning';
  children?: ReactNode;
}) {
  const c = useColors();
  const wellBg = tone === 'danger' ? c.dangerSoft : tone === 'warning' ? c.warningSoft : c.accentSoft;
  const fg = tone === 'danger' ? c.danger : tone === 'warning' ? c.warning : c.accent;
  return (
    <Animated.View entering={FadeInDown.duration(320)} style={styles.wrap}>
      {art ?? (icon && (
        <View style={[styles.well, { backgroundColor: wellBg }]}>
          <Icon name={icon} size="xl" rawColor={fg} strokeWidth={1.5} />
        </View>
      ))}
      <View style={{ gap: space[2], alignItems: 'center' }}>
        <Text variant="title2" align="center" accessibilityRole="header">
          {title}
        </Text>
        {body && (
          <Text variant="callout" color="textSecondary" align="center" style={{ maxWidth: 340 }}>
            {body}
          </Text>
        )}
      </View>
      {children && <View style={styles.actions}>{children}</View>}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: space[5],
    paddingHorizontal: layout.gutter,
    paddingVertical: space[10],
    alignSelf: 'center',
    width: '100%',
    maxWidth: layout.maxContentWidth,
  },
  well: { width: 88, height: 88, borderRadius: radius.xxl, alignItems: 'center', justifyContent: 'center' },
  actions: { alignSelf: 'stretch', gap: space[3], marginTop: space[2] },
});
