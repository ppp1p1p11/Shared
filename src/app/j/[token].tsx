import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Linking, Platform, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { Banner } from '@/components/ui/Banner';
import { BrandMark } from '@/components/ui/BrandMark';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { Skeleton } from '@/components/ui/Skeleton';
import { Text } from '@/components/ui/Text';
import { TextField } from '@/components/ui/TextField';
import { env } from '@/config/env';
import { useJoinAlbum, usePreview } from '@/features/albums/api';
import { useProfile } from '@/features/auth/profile';
import { BlurredPreview } from '@/features/albums/components/BlurredPreview';
import { errorCode, errorMessage } from '@/lib/errors';
import { formatDateRange } from '@/lib/format';
import { haptics } from '@/lib/haptics';
import { toast } from '@/stores/overlay';
import { usePrefs } from '@/stores/prefs';
import { useColors } from '@/theme/ThemeProvider';
import { layout, radius, space } from '@/theme/tokens';

export default function JoinPreview() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const { t } = useTranslation();
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const preview = usePreview(token);
  const profile = useProfile();
  const join = useJoinAlbum();
  const lastName = usePrefs((s) => s.lastDisplayName);
  const setPrefs = usePrefs((s) => s.set);
  const [name, setName] = useState('');
  const [webContinue, setWebContinue] = useState(Platform.OS !== 'web');

  // Prefill with the name used last time on this device.
  useEffect(() => {
    if (!name) setName(profile.data?.display_name || lastName || '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile.data?.display_name, lastName]);

  const p = preview.data;
  const contentW = Math.min(width - layout.gutter * 2, layout.maxContentWidth);

  // Already in → straight to the album (zero friction for repeat taps on the link).
  useEffect(() => {
    if (p && p.state !== 'invalid' && p.my_status === 'active') router.replace(`/album/${p.album_id}`);
    if (p && p.state !== 'invalid' && p.my_status === 'pending') router.replace(`/waiting/${p.album_id}`);
  }, [p]);

  const submit = () => {
    if (!token || !name.trim()) return;
    setPrefs({ lastDisplayName: name.trim() });
    join.mutate(
      { token, displayName: name.trim() },
      {
        onSuccess: (r) => {
          haptics.success();
          if (r.status === 'active') {
            toast(t('join.welcome', { name: p && p.state !== 'invalid' ? p.name : '' }), { icon: 'checkCircle', tone: 'success' });
            router.replace(`/album/${r.album_id}`);
          } else {
            router.replace(`/waiting/${r.album_id}`);
          }
        },
      },
    );
  };

  const goHome = () => (router.canGoBack() ? router.back() : router.replace('/'));

  // ── Designed failure states
  const failure = (() => {
    if (preview.isError) return { icon: 'uploadOff' as const, title: t('join.invalidTitle'), body: errorMessage(preview.error) };
    if (!p) return null;
    if (p.state === 'invalid') return { icon: 'link' as const, title: t('join.invalidTitle'), body: t('errors.invalid_link') };
    if (p.my_status === 'removed' && p.join_mode === 'open') return { icon: 'lock' as const, title: t('join.removedTitle'), body: t('errors.removed') };
    if (p.state === 'locked') return { icon: 'lock' as const, title: t('join.lockedTitle'), body: t('errors.album_locked') };
    if (p.state === 'expired') return { icon: 'clock' as const, title: t('join.expiredTitle'), body: t('errors.link_expired') };
    return null;
  })();

  if (failure) {
    return (
      <View style={[styles.center, { backgroundColor: c.bg, paddingTop: insets.top }]}>
        <EmptyState icon={failure.icon} tone="warning" title={failure.title} body={failure.body}>
          <Button label={t('join.goHome')} variant="secondary" onPress={() => router.replace('/')} />
        </EmptyState>
      </View>
    );
  }

  const ready = p && p.state === 'open';
  const joinError = join.isError ? errorMessage(join.error) : null;
  const joinCode = join.isError ? errorCode(join.error) : null;
  const ctaLabel = ready && p.join_mode === 'approval' ? t('join.requestCta') : t('join.joinCta');
  const meta = ready
    ? [formatDateRange(p.start_date, p.end_date), t('common.members', { count: p.member_count }), p.item_count ? t('common.items', { count: p.item_count }) : null]
        .filter(Boolean)
        .join(' · ')
    : '';

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingTop: insets.top + space[4], paddingBottom: insets.bottom + space[8], alignItems: 'center' }}>
        <View style={[styles.topBar, { width: contentW }]}>
          <BrandMark size={32} bg={c.accent} fg={c.onAccent} />
          {Platform.OS !== 'web' && <Button size="sm" variant="ghost" label={t('common.cancel')} onPress={goHome} />}
        </View>

        <View style={{ width: contentW, gap: space[6] }}>
          {/* Preview */}
          <View style={{ alignItems: 'center', gap: space[5] }}>
            {!ready ? (
              <Skeleton width={contentW * 0.72} height={contentW * 0.72} rounded={radius.xxl} />
            ) : (
              <Animated.View entering={FadeIn.duration(400)}>
                <BlurredPreview hashes={p.cover_thumbhashes} size={contentW * 0.72} />
              </Animated.View>
            )}
            <View style={{ alignItems: 'center', gap: space[1.5] }}>
              <Text variant="subhead" color="textSecondary">
                {t('join.invited')}
              </Text>
              {ready ? (
                <Animated.View entering={FadeInDown.duration(300)} style={{ alignItems: 'center', gap: space[1.5] }}>
                  <Text variant="display" align="center" testID="preview-name">
                    {p.name}
                  </Text>
                  <Text variant="subhead" color="textSecondary" align="center">
                    {t('join.by', { name: p.owner_name || t('common.anonymousName') })}
                  </Text>
                  <Text variant="footnote" color="textTertiary" align="center">
                    {meta}
                  </Text>
                </Animated.View>
              ) : (
                <View style={{ alignItems: 'center', gap: space[2] }}>
                  <Skeleton width={220} height={36} />
                  <Skeleton width={160} height={16} />
                </View>
              )}
            </View>
          </View>

          {/* Web: offer the app first, with an honest browser fallback */}
          {Platform.OS === 'web' && !webContinue && ready && (
            <Animated.View entering={FadeInDown.delay(100)} style={[styles.appCard, { backgroundColor: c.surfaceRaised, borderColor: c.border }]}>
              <Text variant="headline">{t('join.webGetApp')}</Text>
              <Text variant="subhead" color="textSecondary">
                {t('join.webGetAppBody')}
              </Text>
              <Button label={t('join.webOpenApp')} icon="smartphone" onPress={() => Linking.openURL(`${env.appScheme}://j/${token}`)} />
              <View style={{ flexDirection: 'row', gap: space[2] }}>
                <Button size="md" variant="secondary" label="App Store" onPress={() => Linking.openURL(env.appStoreUrl)} style={{ flex: 1 }} />
                <Button size="md" variant="secondary" label="Google Play" onPress={() => Linking.openURL(env.playStoreUrl)} style={{ flex: 1 }} />
              </View>
              <Button testID="web-continue" variant="ghost" label={t('join.webContinue')} onPress={() => setWebContinue(true)} />
            </Animated.View>
          )}

          {/* Name + one button */}
          {webContinue && (
            <Animated.View entering={FadeInDown.delay(80)} style={{ gap: space[4] }}>
              <TextField
                testID="join-name"
                label={t('join.yourName')}
                placeholder={t('join.namePlaceholder')}
                hint={t('join.nameHint')}
                value={name}
                onChangeText={setName}
                maxLength={40}
                autoCapitalize="words"
                autoComplete="name"
                textContentType="name"
                returnKeyType="join"
                onSubmitEditing={submit}
                autoFocus={!name && Platform.OS !== 'web'}
              />
              {joinError && <Banner tone={joinCode === 'offline' ? 'warning' : 'danger'} title={joinError} />}
              <Button testID="join-submit" label={join.isPending ? t('join.joining') : ctaLabel} onPress={submit} loading={join.isPending} disabled={!ready || !name.trim()} />
              <View style={styles.note}>
                <Icon name="shield" size={14} color="textTertiary" />
                <Text variant="footnote" color="textTertiary">
                  {ready && p.join_mode === 'approval' ? `${t('join.approvalNote')} ${t('join.privacyNote')}` : t('join.privacyNote')}
                </Text>
              </View>
            </Animated.View>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center' },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space[6], minHeight: 44 },
  appCard: { borderRadius: radius.xl, padding: space[5], gap: space[3], borderWidth: StyleSheet.hairlineWidth },
  note: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space[1.5] },
});
