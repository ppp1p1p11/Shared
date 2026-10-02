import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, LinearTransition } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { DateRangeCalendar } from '@/components/ui/DateRangeCalendar';
import { SheetHeader } from '@/components/ui/Header';
import { Icon } from '@/components/ui/Icon';
import { PressableScale } from '@/components/ui/PressableScale';
import { Text } from '@/components/ui/Text';
import { TextField } from '@/components/ui/TextField';
import { useCreateAlbum, useMyUsage } from '@/features/albums/api';
import { useProfile, useUpdateProfile } from '@/features/auth/profile';
import { usePrefs } from '@/stores/prefs';
import { errorCode, errorMessage } from '@/lib/errors';
import { formatDateRange } from '@/lib/format';
import { haptics } from '@/lib/haptics';
import { dismissThenPush } from '@/lib/nav';
import { useColors } from '@/theme/ThemeProvider';
import { layout, radius, space } from '@/theme/tokens';

export default function CreateAlbum() {
  const { t } = useTranslation();
  const c = useColors();
  const insets = useSafeAreaInsets();
  const [name, setName] = useState('');
  const [range, setRange] = useState<{ start: string | null; end: string | null }>({ start: null, end: null });
  const [showDates, setShowDates] = useState(false);
  const create = useCreateAlbum();
  const usage = useMyUsage();
  const profile = useProfile();
  const updateProfile = useUpdateProfile();
  const lastName = usePrefs((s) => s.lastDisplayName);
  const setPrefs = usePrefs((s) => s.set);
  // First album on this device: ask for a name once, so members see who made it.
  const needsName = profile.isSuccess && !profile.data.display_name;
  const [myName, setMyName] = useState(lastName);

  const atLimit = !!usage.data && usage.data.album_limit != null && usage.data.album_count >= usage.data.album_limit;
  const limitError = errorCode(create.error) === 'album_limit_reached';
  const canSubmit = name.trim().length > 0 && (!needsName || myName.trim().length > 0) && !create.isPending;

  const submit = async () => {
    if (!canSubmit) return;
    if (needsName) {
      setPrefs({ lastDisplayName: myName.trim() });
      await updateProfile.mutateAsync({ displayName: myName.trim() }).catch(() => {});
    }
    create.mutate(
      { name: name.trim(), startDate: range.start, endDate: range.end ?? range.start },
      {
        onSuccess: (album) => {
          haptics.success();
          dismissThenPush(`/album/${album.id}`);
        },
      },
    );
  };

  const rangeLabel = formatDateRange(range.start, range.end);

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, space[4]) + space[2] }}>
        <SheetHeader title={t('create.title')} />
        <Animated.View layout={LinearTransition} style={styles.body}>
          <TextField
            testID="album-name"
            size="lg"
            autoFocus
            label={t('create.nameLabel')}
            placeholder={t('create.namePlaceholder')}
            value={name}
            onChangeText={setName}
            maxLength={60}
            returnKeyType="done"
            onSubmitEditing={submit}
            autoCapitalize="words"
          />

          {needsName && (
            <TextField
              testID="creator-name"
              label={t('create.yourName')}
              hint={t('create.yourNameHint')}
              placeholder={t('join.namePlaceholder')}
              value={myName}
              onChangeText={setMyName}
              maxLength={40}
              autoCapitalize="words"
              autoComplete="name"
              textContentType="name"
            />
          )}

          <View style={{ gap: space[2] }}>
            <PressableScale
              scaleTo={0.99}
              accessibilityRole="button"
              accessibilityState={{ expanded: showDates }}
              onPress={() => setShowDates((v) => !v)}
              style={[styles.datesRow, { backgroundColor: c.surface }]}
            >
              <Icon name="calendar" color="accent" />
              <View style={{ flex: 1 }}>
                <Text variant="body">{rangeLabel ?? t('create.addDates')}</Text>
                {!rangeLabel && (
                  <Text variant="footnote" color="textTertiary">
                    {t('create.datesOptional')}
                  </Text>
                )}
              </View>
              <Icon name={showDates ? 'chevronDown' : 'chevron'} size="sm" color="textTertiary" />
            </PressableScale>
            {showDates && (
              <Animated.View entering={FadeIn} style={[styles.calendar, { backgroundColor: c.surface }]}>
                <DateRangeCalendar value={range} onChange={setRange} />
              </Animated.View>
            )}
            <Text variant="footnote" color="textTertiary" style={{ paddingHorizontal: space[1] }}>
              {t('create.datesHint')}
            </Text>
          </View>

          {(atLimit || limitError) && (
            <Banner
              tone="warning"
              icon="album"
              title={t('create.limitTitle', { count: usage.data?.album_limit ?? 3 })}
              body={t('create.limitBody')}
              action={<Button size="sm" variant="tinted" icon="sparkles" label={t('album.seePlans')} onPress={() => router.push('/paywall')} />}
            />
          )}
          {create.isError && !limitError && <Banner tone="danger" title={errorMessage(create.error)} />}

          <Button testID="create-submit" label={t('create.submit')} onPress={submit} disabled={!canSubmit || atLimit} loading={create.isPending} />
        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: layout.gutter, gap: space[5], paddingTop: space[2] },
  datesRow: { flexDirection: 'row', alignItems: 'center', gap: space[3], padding: space[4], borderRadius: radius.md, minHeight: 56 },
  calendar: { borderRadius: radius.md, padding: space[3] },
});
