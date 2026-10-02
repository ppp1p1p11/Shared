import * as Clipboard from 'expo-clipboard';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Linking, Platform, ScrollView, Share, StyleSheet, View, useWindowDimensions } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import Animated, { FadeIn, ZoomIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { Banner } from '@/components/ui/Banner';
import { BrandMark } from '@/components/ui/BrandMark';
import { Button } from '@/components/ui/Button';
import { SheetHeader } from '@/components/ui/Header';
import { Skeleton } from '@/components/ui/Skeleton';
import { Text } from '@/components/ui/Text';
import { env } from '@/config/env';
import { inviteUrl, useAlbum } from '@/features/albums/api';
import { formatDateRange, formatRelativeFuture } from '@/lib/format';
import { haptics } from '@/lib/haptics';
import { toast } from '@/stores/overlay';
import { useColors } from '@/theme/ThemeProvider';
import { elevation, layout, radius, space } from '@/theme/tokens';

export default function ShareAlbum() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const album = useAlbum(id);
  const [copied, setCopied] = useState(false);

  const cardW = Math.min(width - layout.gutter * 2, 380);
  const qrSize = Math.round(cardW * 0.62);

  const a = album.data;
  const url = a ? inviteUrl(env.webUrl, a.invite_token) : '';
  const expired = !!a?.invite_expires_at && new Date(a.invite_expires_at) < new Date();
  const range = a ? formatDateRange(a.start_date, a.end_date) : null;
  const message = a ? t('share.shareMessage', { name: a.name, url }) : '';

  const copy = async () => {
    await Clipboard.setStringAsync(url);
    haptics.tick();
    setCopied(true);
    toast(t('share.linkCopied'), { icon: 'check', tone: 'success' });
    setTimeout(() => setCopied(false), 1800);
  };

  const shareNative = async () => {
    if (Platform.OS === 'web' && !(navigator as any).share) return copy();
    try {
      await Share.share(Platform.OS === 'ios' ? { message: t('share.shareMessage', { name: a!.name, url: '' }).trim(), url } : { message });
    } catch {}
  };

  const whatsapp = () => Linking.openURL(`https://wa.me/?text=${encodeURIComponent(message)}`);

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + space[6] }} style={{ backgroundColor: c.bg }}>
      <SheetHeader title={t('share.title')} />
      <View style={styles.body}>
        {!a ? (
          <Skeleton width={cardW} height={cardW * 1.3} rounded={radius.xxl} />
        ) : (
          <Animated.View entering={ZoomIn.springify().damping(18)} style={[{ width: cardW, borderRadius: radius.xxl }, elevation.floating]}>
            <LinearGradient colors={['#FF8A5C', '#CC3D25', '#8E2A1F']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.card, { opacity: a.is_locked || expired ? 0.5 : 1 }]}>
              <View style={{ alignItems: 'center', gap: space[1] }}>
                <Text variant="title1" align="center" style={{ color: '#FFFFFF' }} numberOfLines={2}>
                  {a.name}
                </Text>
                {range && (
                  <Text variant="subhead" style={{ color: 'rgba(255,255,255,0.85)' }}>
                    {range}
                  </Text>
                )}
              </View>
              <View
                style={styles.qrTile}
                accessible
                accessibilityRole="image"
                accessibilityLabel={`${t('share.scanToJoin')}: ${a.name}`}
              >
                <QRCode value={url} size={qrSize} color={c.qrForeground} backgroundColor={c.qrBackground} ecl="H" quietZone={4} />
                <View style={styles.qrLogo}>
                  <BrandMark size={qrSize * 0.2} />
                </View>
              </View>
              <View style={{ alignItems: 'center', gap: space[1] }}>
                <Text variant="headline" style={{ color: '#FFFFFF' }}>
                  {t('share.scanToJoin')}
                </Text>
                <Text variant="footnote" style={{ color: 'rgba(255,255,255,0.75)' }} numberOfLines={1} selectable>
                  {url.replace(/^https?:\/\//, '')}
                </Text>
              </View>
            </LinearGradient>
          </Animated.View>
        )}

        {a && (
          <Animated.View entering={FadeIn.delay(120)} style={{ width: cardW, gap: space[3] }}>
            {a.is_locked && <Banner tone="warning" icon="lock" title={t('share.lockedNotice')} />}
            {expired && <Banner tone="warning" icon="clock" title={t('share.expired')} />}
            {!a.is_locked && !expired && (
              <Text variant="footnote" color="textSecondary" align="center">
                {a.join_mode === 'approval' ? t('share.subtitleApproval') : t('share.subtitle')}
                {a.invite_expires_at ? `\n${t('share.expiresIn', { when: formatRelativeFuture(a.invite_expires_at) })}` : ''}
              </Text>
            )}
            <View style={{ flexDirection: 'row', gap: space[2] }}>
              <Button
                testID="copy-link"
                label={copied ? t('common.copied') : t('share.copyLink')}
                icon={copied ? 'check' : 'link'}
                variant="secondary"
                onPress={copy}
                style={{ flex: 1 }}
              />
              <Button testID="share-link" label={t('share.shareLink')} icon="share" onPress={shareNative} style={{ flex: 1 }} />
            </View>
            <Button label="WhatsApp" variant="ghost" size="md" onPress={whatsapp} />
            {(a.is_locked || expired) && (
              <Button label={t('album.settings')} variant="ghost" size="md" onPress={() => router.replace(`/album/${id}/settings`)} />
            )}
          </Animated.View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: { alignItems: 'center', gap: space[6], paddingTop: space[3], paddingHorizontal: layout.gutter },
  card: { borderRadius: radius.xxl, paddingVertical: space[8], paddingHorizontal: space[6], alignItems: 'center', gap: space[6] },
  qrTile: { backgroundColor: '#FFFFFF', borderRadius: radius.xl, padding: space[3], alignItems: 'center', justifyContent: 'center' },
  qrLogo: { position: 'absolute', padding: 4, backgroundColor: '#FFFFFF', borderRadius: 14 },
});
