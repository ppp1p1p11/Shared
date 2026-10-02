import { useEffect } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut, FadeOutDown, SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { flushCancelledConfirms } from '@/lib/confirm';
import { useOverlay } from '@/stores/overlay';
import { useColors, useTheme } from '@/theme/ThemeProvider';
import { elevation, layout, radius, space } from '@/theme/tokens';
import { Icon } from './Icon';
import { PressableScale } from './PressableScale';
import { Text } from './Text';

/** Global toast + action sheet. Mounted once at the root. */
export function OverlayHost() {
  return (
    <>
      <ToastView />
      <ActionSheetView />
    </>
  );
}

function ToastView() {
  const toast = useOverlay((s) => s.toast);
  const hide = useOverlay((s) => s.hideToast);
  const insets = useSafeAreaInsets();
  const { scheme } = useTheme();
  const c = useColors();

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(hide, toast.actionLabel ? 4500 : 2400);
    return () => clearTimeout(t);
  }, [toast, hide]);

  if (!toast) return null;
  const fg = scheme === 'dark' ? c.textInverse : '#FFFFFF';
  const bg = scheme === 'dark' ? '#F5F5F2' : '#1C1C1B';
  const iconColor = toast.tone === 'danger' ? c.danger : toast.tone === 'success' ? (scheme === 'dark' ? '#1E7A46' : '#4CC384') : fg;
  return (
    <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, { justifyContent: 'flex-start', paddingTop: insets.top + space[2] }]}>
      <Animated.View
        key={toast.id}
        entering={FadeInDown.springify().damping(20)}
        exiting={FadeOut.duration(160)}
        accessibilityLiveRegion="polite"
        accessibilityRole="alert"
        style={[styles.toast, elevation.floating, { backgroundColor: bg }]}
      >
        {toast.icon && <Icon name={toast.icon} size="sm" rawColor={iconColor} />}
        <Text variant="subhead" weight="500" style={{ color: fg, flexShrink: 1 }}>
          {toast.message}
        </Text>
        {toast.actionLabel && (
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              toast.onAction?.();
              hide();
            }}
            hitSlop={12}
          >
            <Text variant="subhead" weight="700" style={{ color: scheme === 'dark' ? c.accentPressed : '#FF8A6E' }}>
              {toast.actionLabel}
            </Text>
          </Pressable>
        )}
      </Animated.View>
    </View>
  );
}

function ActionSheetView() {
  const sheet = useOverlay((s) => s.sheet);
  const hide = useOverlay((s) => s.hideSheet);
  const c = useColors();
  const insets = useSafeAreaInsets();
  const dismiss = () => {
    hide();
    flushCancelledConfirms();
  };
  return (
    <Modal visible={!!sheet} transparent animationType="none" onRequestClose={dismiss} statusBarTranslucent>
      {sheet && (
        <View style={StyleSheet.absoluteFill}>
          <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(160)} style={[StyleSheet.absoluteFill, { backgroundColor: c.overlay }]}>
            <Pressable style={StyleSheet.absoluteFill} onPress={dismiss} accessibilityLabel={sheet.cancelLabel} />
          </Animated.View>
          <Animated.View
            entering={SlideInDown.springify().damping(24).stiffness(220)}
            exiting={SlideOutDown.duration(200)}
            style={[styles.sheetWrap, { paddingBottom: Math.max(insets.bottom, space[3]) }]}
          >
            <View style={[styles.sheet, { backgroundColor: c.surfaceRaised }]} accessibilityViewIsModal>
              {(sheet.title || sheet.message) && (
                <View style={styles.sheetHeader}>
                  {sheet.title && (
                    <Text variant="headline" align="center">
                      {sheet.title}
                    </Text>
                  )}
                  {sheet.message && (
                    <Text variant="footnote" color="textSecondary" align="center">
                      {sheet.message}
                    </Text>
                  )}
                </View>
              )}
              {sheet.actions.map((a, i) => (
                <PressableScale
                  key={a.label}
                  scaleTo={0.985}
                  accessibilityRole="button"
                  accessibilityLabel={a.label}
                  onPress={() => {
                    hide();
                    setTimeout(a.onPress, 120);
                  }}
                  style={[styles.action, (i > 0 || sheet.title || sheet.message) && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.separator }]}
                >
                  {a.icon && <Icon name={a.icon} size="md" color={a.destructive ? 'danger' : 'text'} />}
                  <Text variant="body" color={a.destructive ? 'danger' : 'text'} weight="500">
                    {a.label}
                  </Text>
                </PressableScale>
              ))}
            </View>
            <PressableScale
              scaleTo={0.985}
              accessibilityRole="button"
              onPress={dismiss}
              style={[styles.sheet, styles.cancel, { backgroundColor: c.surfaceRaised }]}
            >
              <Text variant="headline">{sheet.cancelLabel}</Text>
            </PressableScale>
          </Animated.View>
        </View>
      )}
    </Modal>
  );
}

const styles = StyleSheet.create({
  toast: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
    paddingHorizontal: space[4],
    paddingVertical: space[3],
    borderRadius: radius.pill,
    maxWidth: '92%',
  },
  sheetWrap: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: space[2], gap: space[2], alignItems: 'center' },
  sheet: { borderRadius: radius.xl, overflow: 'hidden', width: '100%', maxWidth: layout.maxContentWidth },
  sheetHeader: { paddingHorizontal: space[5], paddingVertical: space[4], gap: space[1] },
  action: { minHeight: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space[3], paddingHorizontal: space[5] },
  cancel: { minHeight: 56, alignItems: 'center', justifyContent: 'center' },
});
