import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { ScreenHeader } from '@/components/ui/Header';
import { Segmented } from '@/components/ui/Segmented';
import { Text } from '@/components/ui/Text';
import { TextField } from '@/components/ui/TextField';
import { useAuth } from '@/features/auth/session';
import { haptics } from '@/lib/haptics';
import { supabase } from '@/lib/supabase';
import { toast } from '@/stores/overlay';
import { useColors } from '@/theme/ThemeProvider';
import { layout, space } from '@/theme/tokens';

type Channel = 'email' | 'phone';
type Mode = 'link' | 'signin';

/**
 * Optional account upgrade. Never forced. Linking keeps the same user id, so every album and
 * upload stays put; signing in on another phone brings them there too.
 */
export default function Account() {
  const { t } = useTranslation();
  const c = useColors();
  const qc = useQueryClient();
  const insets = useSafeAreaInsets();
  const auth = useAuth();
  const [mode, setMode] = useState<Mode>('link');
  const [channel, setChannel] = useState<Channel>('email');
  const [target, setTarget] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'enter' | 'code'>('enter');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const normalized = channel === 'phone' ? target.replace(/[^\d+]/g, '').replace(/^\+/, '') : target.trim().toLowerCase();

  const send = async () => {
    setBusy(true);
    setError(null);
    const res =
      mode === 'link'
        ? await supabase.auth.updateUser(channel === 'email' ? { email: normalized } : { phone: normalized })
        : await supabase.auth.signInWithOtp(channel === 'email' ? { email: normalized, options: { shouldCreateUser: false } } : { phone: normalized, options: { shouldCreateUser: false } });
    setBusy(false);
    if (res.error) {
      setError(/already|registered|exists/i.test(res.error.message) ? t('link.alreadyUsed') : res.error.message);
      return;
    }
    // Projects without confirmations apply the change immediately: nothing to verify.
    const user = 'user' in res.data ? res.data.user : null;
    if (mode === 'link' && user && !user.is_anonymous && (user.email === normalized || user.phone === normalized)) {
      haptics.success();
      qc.invalidateQueries();
      toast(t('link.linked', { target: normalized }), { icon: 'shield', tone: 'success' });
      router.back();
      return;
    }
    setStep('code');
  };

  const verify = async () => {
    setBusy(true);
    setError(null);
    const type = mode === 'link' ? (channel === 'email' ? 'email_change' : 'phone_change') : channel === 'email' ? 'email' : 'sms';
    const res = await supabase.auth.verifyOtp(channel === 'email' ? { email: normalized, token: code.trim(), type: type as 'email_change' } : { phone: normalized, token: code.trim(), type: type as 'sms' });
    setBusy(false);
    if (res.error) {
      setError(t('link.invalidCode'));
      return;
    }
    haptics.success();
    qc.invalidateQueries();
    toast(t('link.linked', { target: normalized }), { icon: 'shield', tone: 'success' });
    router.back();
  };

  if (!auth.isAnonymous && mode === 'link') {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg }}>
        <ScreenHeader title={t('settings.account')} />
        <EmptyState icon="shield" title={t('settings.accountLinked', { id: auth.email ?? auth.phone })} body={t('link.body')} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: c.bg }}>
      <ScreenHeader title={mode === 'link' ? t('link.title') : t('link.signInTitle')} large />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: insets.bottom + space[8] }}>
        <View style={styles.body}>
          <Text variant="callout" color="textSecondary">
            {mode === 'link' ? t('link.body') : t('link.signInBody')}
          </Text>
          {step === 'enter' ? (
            <Animated.View entering={FadeInDown} style={{ gap: space[4] }}>
              <Segmented<Channel>
                value={channel}
                onChange={(v) => {
                  setChannel(v);
                  setTarget('');
                }}
                options={[
                  { value: 'email', label: t('link.email') },
                  { value: 'phone', label: t('link.phone') },
                ]}
              />
              <TextField
                testID="link-target"
                size="lg"
                value={target}
                onChangeText={setTarget}
                placeholder={channel === 'email' ? t('link.emailPlaceholder') : t('link.phonePlaceholder')}
                keyboardType={channel === 'email' ? 'email-address' : 'phone-pad'}
                autoCapitalize="none"
                autoComplete={channel === 'email' ? 'email' : 'tel'}
                textContentType={channel === 'email' ? 'emailAddress' : 'telephoneNumber'}
                autoFocus
                onSubmitEditing={send}
              />
              {error && <Banner tone="danger" title={error} />}
              <Button testID="link-send" label={t('link.sendCode')} onPress={send} loading={busy} disabled={normalized.length < 5} />
              <Button
                variant="ghost"
                size="md"
                label={mode === 'link' ? t('link.signInInstead') : t('link.title')}
                onPress={() => {
                  setMode(mode === 'link' ? 'signin' : 'link');
                  setError(null);
                }}
              />
            </Animated.View>
          ) : (
            <Animated.View entering={FadeInDown} style={{ gap: space[4] }}>
              <Text variant="headline">{t('link.codeTitle')}</Text>
              <Text variant="subhead" color="textSecondary">
                {t('link.codeBody', { target: normalized })}
              </Text>
              <TextField
                testID="link-code"
                size="lg"
                value={code}
                onChangeText={setCode}
                placeholder="000000"
                keyboardType="number-pad"
                autoComplete="one-time-code"
                textContentType="oneTimeCode"
                maxLength={6}
                autoFocus
                onSubmitEditing={verify}
                style={{ letterSpacing: 8 }}
              />
              {error && <Banner tone="danger" title={error} />}
              <Button testID="link-verify" label={t('link.verify')} onPress={verify} loading={busy} disabled={code.trim().length < 6} />
              <Button variant="ghost" size="md" label={t('link.resend')} onPress={send} />
            </Animated.View>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: layout.gutter, gap: space[5], paddingTop: space[2], width: '100%', maxWidth: layout.maxContentWidth + layout.gutter * 2, alignSelf: 'center' },
});
