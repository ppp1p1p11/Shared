import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { IconButton } from '@/components/ui/IconButton';
import { Text } from '@/components/ui/Text';
import { useColors, useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';

/** Floating chrome over edge-to-edge photos; recedes into a soft scrim. */
export function AlbumTopBar({
  albumId,
  title,
  subtitle,
  overPhotos,
  selecting,
  selectedLabel,
  onCancelSelect,
  onSelectAll,
  selectAllLabel,
}: {
  albumId: string;
  title: string;
  subtitle?: string;
  overPhotos: boolean;
  selecting?: boolean;
  selectedLabel?: string;
  onCancelSelect?: () => void;
  onSelectAll?: () => void;
  selectAllLabel?: string;
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const c = useColors();
  const { scheme } = useTheme();
  const onPhoto = overPhotos && !selecting;
  const variant = onPhoto ? 'onPhoto' : 'filled';
  const textColor = onPhoto ? '#FFFFFF' : c.text;

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { paddingTop: insets.top }]}>
      {onPhoto && (
        <LinearGradient
          pointerEvents="none"
          colors={['rgba(0,0,0,0.55)', 'rgba(0,0,0,0.25)', 'rgba(0,0,0,0)']}
          style={[StyleSheet.absoluteFill, { height: insets.top + 110 }]}
        />
      )}
      {!onPhoto && <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: scheme === 'dark' ? 'rgba(0,0,0,0.92)' : 'rgba(255,255,255,0.94)' }]} />}
      <View style={styles.row}>
        {selecting ? (
          <IconButton icon="close" variant="filled" label={t('common.cancel')} onPress={onCancelSelect} />
        ) : (
          <IconButton icon="back" variant={variant} label={t('common.back')} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
        )}
        <View style={{ flex: 1, alignItems: 'center', paddingHorizontal: space[2] }}>
          <Text variant="headline" numberOfLines={1} style={{ color: textColor }} accessibilityRole="header">
            {selecting ? selectedLabel : title}
          </Text>
          {!selecting && subtitle && (
            <Text variant="caption" numberOfLines={1} style={{ color: onPhoto ? 'rgba(255,255,255,0.85)' : c.textSecondary }}>
              {subtitle}
            </Text>
          )}
        </View>
        {selecting ? (
          <IconButton icon="checkCircle" variant="filled" label={selectAllLabel ?? t('common.selectAll')} onPress={onSelectAll} />
        ) : (
          <View style={{ flexDirection: 'row', gap: space[2] }}>
            <IconButton testID="album-invite" icon="userAdd" variant={variant} label={t('album.inviteCta')} onPress={() => router.push(`/album/${albumId}/share`)} />
            <IconButton testID="album-settings" icon="more" variant={variant} label={t('album.settings')} onPress={() => router.push(`/album/${albumId}/settings`)} />
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10 },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space[3], paddingBottom: space[2], minHeight: 56 },
});
