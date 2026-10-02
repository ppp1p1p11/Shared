import { router } from 'expo-router';
import { type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { useColors } from '@/theme/ThemeProvider';
import { layout, space } from '@/theme/tokens';
import { IconButton } from './IconButton';
import { Text } from './Text';

/** Header for sheets and modals: centered title, close on the trailing side. */
export function SheetHeader({ title, onClose, trailing, leading }: { title?: string; onClose?: () => void; trailing?: ReactNode; leading?: ReactNode }) {
  const { t } = useTranslation();
  return (
    <View style={styles.sheet}>
      <View style={styles.side}>{leading}</View>
      <Text variant="headline" align="center" numberOfLines={1} style={{ flex: 1 }} accessibilityRole="header">
        {title}
      </Text>
      <View style={[styles.side, { alignItems: 'flex-end' }]}>
        {trailing ?? <IconButton icon="close" variant="filled" size="sm" label={t('common.close')} onPress={onClose ?? (() => router.back())} />}
      </View>
    </View>
  );
}

/** Header for pushed screens: back button, optional large title below. */
export function ScreenHeader({ title, large, trailing, onBack }: { title?: string; large?: boolean; trailing?: ReactNode; onBack?: () => void }) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const c = useColors();
  return (
    <View style={{ paddingTop: insets.top, backgroundColor: c.bg }}>
      <View style={styles.bar}>
        <IconButton icon="back" label={t('common.back')} onPress={onBack ?? (() => (router.canGoBack() ? router.back() : router.replace('/')))} />
        {!large && (
          <Text variant="headline" numberOfLines={1} style={{ flex: 1, textAlign: 'center' }} accessibilityRole="header">
            {title}
          </Text>
        )}
        {large && <View style={{ flex: 1 }} />}
        <View style={{ minWidth: layout.minTouch, alignItems: 'flex-end' }}>{trailing}</View>
      </View>
      {large && title && (
        <Text variant="title1" style={{ paddingHorizontal: layout.gutter, paddingBottom: space[2] }} accessibilityRole="header">
          {title}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space[4], paddingTop: space[4], paddingBottom: space[2], minHeight: 60 },
  side: { width: 88 },
  bar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space[2], minHeight: 52 },
});
