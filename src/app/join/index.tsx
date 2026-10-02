import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/Button';
import { SheetHeader } from '@/components/ui/Header';
import { Text } from '@/components/ui/Text';
import { TextField } from '@/components/ui/TextField';
import { parseInviteToken } from '@/features/albums/api';
import { dismissThenPush } from '@/lib/nav';
import { useColors } from '@/theme/ThemeProvider';
import { layout, space } from '@/theme/tokens';

export default function JoinEntry() {
  const { t } = useTranslation();
  const c = useColors();
  const insets = useSafeAreaInsets();
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  const go = (input: string) => {
    const token = parseInviteToken(input);
    if (!token) {
      setError(t('errors.invalid_link'));
      return;
    }
    dismissThenPush(`/j/${token}`);
  };

  const paste = async () => {
    const text = await Clipboard.getStringAsync();
    setValue(text);
    setError(null);
    if (parseInviteToken(text)) go(text);
  };

  return (
    <View style={{ paddingBottom: Math.max(insets.bottom, space[4]) + space[2] }}>
      <SheetHeader title={t('join.title')} />
      <View style={styles.body}>
        <Button testID="scan-qr" label={t('join.scanQr')} icon="scan" onPress={() => dismissThenPush('/scan')} disabled={Platform.OS === 'web'} />
        <View style={styles.or}>
          <View style={[styles.line, { backgroundColor: c.separator }]} />
          <Text variant="footnote" color="textTertiary">
            {t('join.pasteTitle')}
          </Text>
          <View style={[styles.line, { backgroundColor: c.separator }]} />
        </View>
        <TextField
          testID="invite-input"
          placeholder={t('join.pastePlaceholder')}
          value={value}
          onChangeText={(v) => {
            setValue(v);
            setError(null);
          }}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType={Platform.OS === 'ios' ? 'url' : 'default'}
          returnKeyType="go"
          onSubmitEditing={() => go(value)}
          error={error}
          trailing={
            value ? null : (
              <Button size="sm" variant="ghost" label={t('join.paste')} icon="paste" onPress={paste} />
            )
          }
        />
        <Button label={t('common.continue')} variant="secondary" onPress={() => go(value)} disabled={!value.trim()} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: layout.gutter, gap: space[4], paddingTop: space[2] },
  or: { flexDirection: 'row', alignItems: 'center', gap: space[3], marginVertical: space[1] },
  line: { flex: 1, height: StyleSheet.hairlineWidth },
});
