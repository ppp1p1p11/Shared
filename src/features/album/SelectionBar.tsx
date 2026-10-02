import { StyleSheet, View } from 'react-native';
import Animated, { SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { GlassSurface } from '@/components/ui/GlassSurface';
import { Icon, type IconName } from '@/components/ui/Icon';
import { PressableScale } from '@/components/ui/PressableScale';
import { Text } from '@/components/ui/Text';
import { radius, space } from '@/theme/tokens';

function Action({ icon, label, onPress, disabled, destructive }: { icon: IconName; label: string; onPress: () => void; disabled?: boolean; destructive?: boolean }) {
  return (
    <PressableScale onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={label} style={[styles.action, { opacity: disabled ? 0.35 : 1 }]}>
      <Icon name={icon} color={destructive ? 'danger' : 'text'} />
      <Text variant="caption" color={destructive ? 'danger' : 'text'}>
        {label}
      </Text>
    </PressableScale>
  );
}

/** Bottom action bar in multi-select mode: Save · Share · Delete (own only, or anything for the owner). */
export function SelectionBar({ count, canDelete, onSave, onShare, onDelete }: { count: number; canDelete: boolean; onSave: () => void; onShare: () => void; onDelete: () => void }) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  return (
    <Animated.View entering={SlideInDown.springify().damping(22)} exiting={SlideOutDown.duration(180)} style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, space[3]) }]}>
      <GlassSurface style={styles.bar} interactive>
        <Action icon="download" label={t('common.save')} onPress={onSave} disabled={!count} />
        <Action icon="share" label={t('common.share')} onPress={onShare} disabled={!count} />
        <Action icon="trash" label={t('common.delete')} onPress={onDelete} disabled={!count || !canDelete} destructive />
      </GlassSurface>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center', paddingHorizontal: space[4] },
  bar: { flexDirection: 'row', borderRadius: radius.xl + 4, padding: space[1.5], width: '100%', maxWidth: 420, justifyContent: 'space-around' },
  action: { alignItems: 'center', justifyContent: 'center', gap: 2, minWidth: 72, minHeight: 52, paddingHorizontal: space[2] },
});
