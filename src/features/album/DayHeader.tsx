import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Text } from '@/components/ui/Text';
import { formatDayHeader } from '@/lib/format';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';

export const DayHeader = memo(function DayHeader({ day, count, sticky }: { day: string; count: number; sticky?: boolean }) {
  const { t } = useTranslation();
  const { colors, scheme } = useTheme();
  return (
    <View
      accessibilityRole="header"
      style={[
        styles.wrap,
        { backgroundColor: sticky ? (scheme === 'dark' ? 'rgba(0,0,0,0.88)' : 'rgba(255,255,255,0.92)') : colors.bgPhoto === '#000000' ? colors.bg : colors.bg },
      ]}
    >
      <Text variant="headline">
        {formatDayHeader(day)}
      </Text>
      <Text variant="footnote" color="textTertiary">
        {t('common.items', { count })}
      </Text>
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { height: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space[4] },
});
