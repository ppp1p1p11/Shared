import { type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';

import { useColors } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';
import { Icon, type IconName } from './Icon';
import { IconButton } from './IconButton';
import { Text } from './Text';

type Tone = 'info' | 'warning' | 'danger' | 'success';

/** Calm, inline, non-blocking notice. */
export function Banner({
  tone = 'info',
  icon,
  title,
  body,
  action,
  onDismiss,
  dismissLabel,
}: {
  tone?: Tone;
  icon?: IconName;
  title: string;
  body?: string;
  action?: ReactNode;
  onDismiss?: () => void;
  dismissLabel?: string;
}) {
  const c = useColors();
  const map: Record<Tone, { bg: string; fg: string; icon: IconName }> = {
    info: { bg: c.surface, fg: c.accent, icon: 'info' },
    warning: { bg: c.warningSoft, fg: c.warning, icon: 'warning' },
    danger: { bg: c.dangerSoft, fg: c.danger, icon: 'alert' },
    success: { bg: c.successSoft, fg: c.success, icon: 'checkCircle' },
  };
  const t = map[tone];
  return (
    <Animated.View
      entering={FadeIn.duration(240)}
      exiting={FadeOut.duration(180)}
      layout={LinearTransition}
      accessibilityRole={tone === 'danger' || tone === 'warning' ? 'alert' : 'summary'}
      style={[styles.box, { backgroundColor: t.bg }]}
    >
      <View style={{ paddingTop: 1 }}>
        <Icon name={icon ?? t.icon} size="md" rawColor={t.fg} />
      </View>
      <View style={{ flex: 1, gap: space[1] }}>
        <Text variant="subhead" weight="600">
          {title}
        </Text>
        {body && (
          <Text variant="footnote" color="textSecondary">
            {body}
          </Text>
        )}
        {action && <View style={{ marginTop: space[2], flexDirection: 'row' }}>{action}</View>}
      </View>
      {onDismiss && (
        <IconButton icon="close" size="sm" label={dismissLabel ?? 'Dismiss'} onPress={onDismiss} color="textTertiary" style={{ marginTop: -10, marginRight: -10 }} />
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  box: { flexDirection: 'row', gap: space[3], padding: space[4], borderRadius: radius.lg },
});
