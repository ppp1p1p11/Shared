import { useQueryClient } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { BrandMark } from '@/components/ui/BrandMark';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { Text } from '@/components/ui/Text';
import { UsageBar } from '@/components/ui/UsageBar';
import { useAlbum, useMyUsage } from '@/features/albums/api';
import { useUploads } from '@/features/upload/store';
import { errorMessage } from '@/lib/errors';
import { formatBytes } from '@/lib/format';
import { haptics } from '@/lib/haptics';
import { qk } from '@/lib/queryClient';
import { supabase } from '@/lib/supabase';
import { toast } from '@/stores/overlay';
import { useColors } from '@/theme/ThemeProvider';
import { layout, radius, space } from '@/theme/tokens';

/** Mock paywall: calm, honest, no dark patterns. No payment is taken in the prototype. */
export default function Paywall() {
  const { albumId, reason } = useLocalSearchParams<{ albumId?: string; reason?: string }>();
  const { t } = useTranslation();
  const c = useColors();
  const qc = useQueryClient();
  const insets = useSafeAreaInsets();
  const usage = useMyUsage();
  const album = useAlbum(albumId ?? '');
  const [busy, setBusy] = useState(false);
  const full = reason === 'full';

  const upgrade = async () => {
    setBusy(true);
    const { error } = await supabase.rpc('mock_set_plan', { p_plan: 'plus' });
    setBusy(false);
    if (error) return toast(errorMessage(error), { icon: 'alert', tone: 'danger' });
    haptics.success();
    useUploads.getState().resumeQuotaPaused();
    qc.invalidateQueries({ queryKey: qk.usage });
    qc.invalidateQueries({ queryKey: ['albumStorage'] });
    qc.invalidateQueries({ queryKey: qk.profile });
    toast(t('paywall.activated'), { icon: 'sparkles', tone: 'success' });
    router.back();
  };

  const perks = [t('paywall.perk1'), t('paywall.perk2'), t('paywall.perk3'), t('paywall.perk4')];

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 140 }}>
        <LinearGradient colors={['#FF8A5C', '#CC3D25', '#7A2418']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.hero, { paddingTop: space[10] }]}>
          <View style={{ position: 'absolute', top: space[4], right: space[4] }}>
            <IconButton icon="close" variant="onPhoto" label={t('common.close')} onPress={() => router.back()} />
          </View>
          <BrandMark size={56} bg="#FFFFFF" fg="#CC3D25" />
          <Text variant="overline" style={{ color: 'rgba(255,255,255,0.85)', marginTop: space[4] }}>
            {t('paywall.title').toUpperCase()}
          </Text>
          <Text variant="title1" align="center" style={{ color: '#FFF' }}>
            {full ? t('paywall.fullTitle') : t('paywall.headline')}
          </Text>
          <Text variant="callout" align="center" style={{ color: 'rgba(255,255,255,0.9)', maxWidth: 340 }}>
            {full && usage.data
              ? t('paywall.fullBody', { album: album.data?.name ?? '', used: formatBytes(usage.data.used_bytes), limit: formatBytes(usage.data.limit_bytes) })
              : t('paywall.body')}
          </Text>
        </LinearGradient>

        <View style={styles.body}>
          {usage.data && (
            <View style={[styles.card, { backgroundColor: c.surface }]}>
              <UsageBar label={album.data?.name ?? t('settings.storage')} used={usage.data.used_bytes} limit={usage.data.limit_bytes} warnRatio={usage.data.warn_ratio} />
            </View>
          )}
          <View style={{ gap: space[3] }}>
            {perks.map((p, i) => (
              <Animated.View key={p} entering={FadeInDown.delay(80 + i * 60)} style={styles.perk}>
                <View style={[styles.perkIcon, { backgroundColor: c.accentSoft }]}>
                  <Icon name="check" size="sm" color="accent" strokeWidth={2.5} />
                </View>
                <Text variant="body">{p}</Text>
              </Animated.View>
            ))}
          </View>
          {full && (
            <Text variant="footnote" color="textSecondary">
              {t('paywall.alternatives')}
            </Text>
          )}
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, space[4]), backgroundColor: c.bg, borderTopColor: c.separator }]}>
        <Text variant="headline">{t('paywall.price')}</Text>
        <Button testID="paywall-cta" label={t('paywall.cta')} icon="sparkles" onPress={upgrade} loading={busy} fullWidth />
        <Button label={t('common.notNow')} variant="ghost" size="md" onPress={() => router.back()} />
        <Text variant="caption" color="textTertiary">
          {t('paywall.mockNote')}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', gap: space[2], paddingHorizontal: layout.gutter, paddingBottom: space[8], borderBottomLeftRadius: radius.xxl, borderBottomRightRadius: radius.xxl },
  body: { padding: layout.gutter, gap: space[6], maxWidth: layout.maxContentWidth + layout.gutter * 2, width: '100%', alignSelf: 'center' },
  card: { borderRadius: radius.lg, padding: space[4] },
  perk: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  perkIcon: { width: 32, height: 32, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center', gap: space[2], paddingTop: space[3], paddingHorizontal: layout.gutter, borderTopWidth: StyleSheet.hairlineWidth },
});
