import { CameraView, useCameraPermissions } from 'expo-camera';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { Linking, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { IconButton } from '@/components/ui/IconButton';
import { Text } from '@/components/ui/Text';
import { parseInviteToken } from '@/features/albums/api';
import { haptics } from '@/lib/haptics';
import { radius, space } from '@/theme/tokens';

export default function Scan() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [perm, requestPerm] = useCameraPermissions();
  const [hint, setHint] = useState<string | null>(null);
  const handled = useRef(false);
  const box = Math.min(width * 0.7, 300);

  const onScan = ({ data }: { data: string }) => {
    if (handled.current) return;
    const token = parseInviteToken(data);
    if (!token) {
      setHint(t('scan.notRolo'));
      return;
    }
    handled.current = true;
    haptics.success();
    router.replace(`/j/${token}`);
  };

  const close = (
    <IconButton icon="close" variant="onPhoto" label={t('common.close')} onPress={() => router.back()} style={{ position: 'absolute', top: insets.top + space[2], right: space[4] }} />
  );

  if (!perm) return <View style={styles.black} />;

  if (!perm.granted) {
    return (
      <View style={[styles.black, { justifyContent: 'center' }]}>
        <EmptyState icon="camera" title={t('scan.permissionTitle')} body={t('scan.permissionBody')}>
          {perm.canAskAgain ? (
            <Button label={t('scan.allow')} onPress={requestPerm} />
          ) : (
            <Button label={t('errors.openSettings')} onPress={() => Linking.openSettings()} />
          )}
        </EmptyState>
        {close}
      </View>
    );
  }

  return (
    <View style={styles.black}>
      <CameraView style={StyleSheet.absoluteFill} facing="back" barcodeScannerSettings={{ barcodeTypes: ['qr'] }} onBarcodeScanned={onScan} />
      {/* Viewfinder: dimmed surround with a clear rounded window */}
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
        <Animated.View entering={FadeIn.duration(400)} style={[styles.window, { width: box, height: box }]}>
          {(['tl', 'tr', 'bl', 'br'] as const).map((k) => (
            <View key={k} style={[styles.corner, cornerStyle[k]]} />
          ))}
        </Animated.View>
        <Animated.View entering={FadeInDown.delay(200)} style={{ marginTop: space[6], paddingHorizontal: space[8] }}>
          <Text variant="headline" align="center" style={{ color: '#FFF' }} accessibilityLiveRegion="polite">
            {hint ?? t('scan.hint')}
          </Text>
        </Animated.View>
      </View>
      {close}
    </View>
  );
}

const C = 34;
const styles = StyleSheet.create({
  black: { flex: 1, backgroundColor: '#000' },
  window: { borderRadius: radius.xl, shadowColor: '#000', shadowOpacity: 0.55, shadowRadius: 400, shadowOffset: { width: 0, height: 0 } },
  corner: { position: 'absolute', width: C, height: C, borderColor: '#FFFFFF' },
});
const cornerStyle = StyleSheet.create({
  tl: { top: 0, left: 0, borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: radius.xl },
  tr: { top: 0, right: 0, borderTopWidth: 4, borderRightWidth: 4, borderTopRightRadius: radius.xl },
  bl: { bottom: 0, left: 0, borderBottomWidth: 4, borderLeftWidth: 4, borderBottomLeftRadius: radius.xl },
  br: { bottom: 0, right: 0, borderBottomWidth: 4, borderRightWidth: 4, borderBottomRightRadius: radius.xl },
});
