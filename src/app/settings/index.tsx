import { router } from 'expo-router';
import Constants from 'expo-constants';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { Avatar } from '@/components/ui/Avatar';
import { BrandMark } from '@/components/ui/BrandMark';
import { ScreenHeader } from '@/components/ui/Header';
import { ListGroup, ListRow } from '@/components/ui/List';
import { Segmented } from '@/components/ui/Segmented';
import { Skeleton } from '@/components/ui/Skeleton';
import { Text } from '@/components/ui/Text';
import { TextField } from '@/components/ui/TextField';
import { UsageBar } from '@/components/ui/UsageBar';
import { useMyUsage } from '@/features/albums/api';
import { deleteMyData } from '@/features/auth/deleteMyData';
import { useProfile, useUpdateProfile } from '@/features/auth/profile';
import { useAuth } from '@/features/auth/session';
import { askNotificationPermission } from '@/features/notifications/notify';
import { confirm } from '@/lib/confirm';
import { errorMessage } from '@/lib/errors';
import { formatBytes } from '@/lib/format';
import { haptics } from '@/lib/haptics';
import { toast } from '@/stores/overlay';
import { usePrefs, type Appearance, type LanguagePref } from '@/stores/prefs';
import { useColors } from '@/theme/ThemeProvider';
import { layout, radius, space } from '@/theme/tokens';

export default function Settings() {
  const { t } = useTranslation();
  const c = useColors();
  const insets = useSafeAreaInsets();
  const auth = useAuth();
  const profile = useProfile();
  const updateProfile = useUpdateProfile();
  const usage = useMyUsage();
  const prefs = usePrefs();
  const [name, setName] = useState('');
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (profile.data) setName(profile.data.display_name);
  }, [profile.data?.display_name]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveName = () => {
    const v = name.trim();
    if (!v || v === profile.data?.display_name) return;
    prefs.set({ lastDisplayName: v });
    updateProfile.mutate({ displayName: v }, { onError: (e) => toast(errorMessage(e), { icon: 'alert', tone: 'danger' }) });
  };

  const onDelete = async () => {
    const ok = await confirm({ title: t('settings.deleteData'), message: t('settings.deleteDataBody'), confirmLabel: t('settings.deleteDataConfirm'), destructive: true });
    if (!ok) return;
    setDeleting(true);
    try {
      await deleteMyData();
      haptics.success();
      toast(t('settings.deleteDataDone'), { icon: 'checkCircle', tone: 'success' });
      router.dismissTo('/');
    } catch (e) {
      toast(errorMessage(e), { icon: 'alert', tone: 'danger' });
    } finally {
      setDeleting(false);
    }
  };

  const languages: { value: LanguagePref; label: string }[] = [
    { value: 'auto', label: t('settings.languageAuto') },
    { value: 'pt-BR', label: 'Português (Brasil)' },
    { value: 'en', label: 'English' },
  ];
  const accountId = auth.email ?? auth.phone;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ScreenHeader title={t('settings.title')} large />
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + space[10] }} keyboardShouldPersistTaps="handled">
        <View style={styles.body}>
          {/* Profile */}
          <View style={[styles.profile, { backgroundColor: c.surface }]}>
            <Avatar name={name || profile.data?.display_name} color={profile.data?.avatar_color} size={56} />
            <View style={{ flex: 1 }}>
              <TextField
                label={t('settings.displayName')}
                value={name}
                onChangeText={setName}
                onBlur={saveName}
                onSubmitEditing={saveName}
                maxLength={40}
                autoCapitalize="words"
                returnKeyType="done"
                testID="settings-name"
              />
            </View>
          </View>

          <ListGroup title={t('settings.account')} footer={auth.isAnonymous ? t('settings.accountAnonymousHint') : undefined}>
            <ListRow
              icon={auth.isAnonymous ? 'smartphone' : 'shield'}
              title={auth.isAnonymous ? t('settings.accountAnonymous') : t('settings.accountLinked', { id: accountId })}
              value={auth.isAnonymous ? t('settings.linkAccount') : undefined}
              onPress={() => router.push('/settings/account')}
              chevron
              testID="settings-account"
            />
          </ListGroup>

          {/* Storage overview across owned albums */}
          <ListGroup title={t('settings.storage')}>
            <View style={{ padding: space[4], gap: space[4] }}>
              {usage.data ? (
                <>
                  <UsageBar label={t('settings.storageTotal')} used={usage.data.used_bytes} limit={usage.data.limit_bytes} warnRatio={usage.data.warn_ratio} />
                  {usage.data.albums.length === 0 ? (
                    <Text variant="footnote" color="textTertiary">
                      {t('settings.storageEmpty')}
                    </Text>
                  ) : (
                    usage.data.albums.map((a) => (
                      <View key={a.album_id} style={styles.storageRow}>
                        <Text variant="subhead" numberOfLines={1} style={{ flex: 1 }}>
                          {a.name}
                        </Text>
                        <Text variant="subhead" color="textSecondary" tabular>
                          {formatBytes(a.bytes)}
                        </Text>
                      </View>
                    ))
                  )}
                </>
              ) : (
                <Skeleton height={40} />
              )}
            </View>
            <ListRow
              icon="crown"
              title={t('settings.plan')}
              value={usage.data?.plan === 'plus' ? t('settings.planPlus') : t('settings.planFree')}
              onPress={() => router.push('/paywall')}
              chevron
            />
          </ListGroup>

          <ListGroup title={t('settings.uploads')} footer={t('settings.wifiOnlyHint')}>
            <ListRow icon="upload" title={t('settings.wifiOnly')} toggle={{ value: prefs.wifiOnlyUploads, onChange: (v) => prefs.set({ wifiOnlyUploads: v }) }} />
            <ListRow icon="info" title={t('settings.notifications')} subtitle={t('settings.notificationsHint')} onPress={() => askNotificationPermission()} chevron />
          </ListGroup>

          <ListGroup title={t('settings.language')}>
            {languages.map((l) => (
              <ListRow key={l.value} title={l.label} checked={prefs.language === l.value} onPress={() => prefs.set({ language: l.value })} />
            ))}
          </ListGroup>

          <View style={{ gap: space[2] }}>
            <Text variant="footnote" color="textSecondary" weight="600" style={{ paddingHorizontal: space[4] }}>
              {t('settings.appearance')}
            </Text>
            <Segmented<Appearance>
              value={prefs.appearance}
              onChange={(v) => prefs.set({ appearance: v })}
              options={[
                { value: 'system', label: t('settings.appearanceSystem') },
                { value: 'light', label: t('settings.appearanceLight') },
                { value: 'dark', label: t('settings.appearanceDark') },
              ]}
            />
          </View>

          <ListGroup title={t('settings.privacy')} footer={t('settings.privacyPromise')}>
            <ListRow icon="report" title={t('settings.reportContent')} subtitle={t('settings.reportContentHint')} />
            <ListRow icon="trash" title={deleting ? t('settings.deleting') : t('settings.deleteData')} destructive onPress={deleting ? undefined : onDelete} testID="delete-data" />
          </ListGroup>

          <View style={styles.about}>
            <BrandMark size={36} bg={c.accent} fg={c.onAccent} />
            <Text variant="footnote" color="textTertiary">
              {t('settings.version', { version: Constants.expoConfig?.version ?? '0.1.0' })} · {t('settings.madeIn')}
            </Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: layout.gutter, gap: space[6], paddingTop: space[2], width: '100%', maxWidth: layout.maxContentWidth + layout.gutter * 2, alignSelf: 'center' },
  profile: { flexDirection: 'row', alignItems: 'center', gap: space[4], padding: space[4], borderRadius: radius.lg },
  storageRow: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  about: { alignItems: 'center', gap: space[2], paddingTop: space[4] },
});
