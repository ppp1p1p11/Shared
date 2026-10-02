import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';

import { motion } from '@/theme/tokens';

const MAX = 5;

/** Pinch / double-tap zoom with panning while zoomed. Reports zoom state so the pager can lock. */
export function ZoomableImage({
  width,
  height,
  active,
  onZoomChange,
  onSingleTap,
  onLongPressIn,
  onLongPressOut,
  children,
}: {
  width: number;
  height: number;
  active: boolean;
  onZoomChange: (zoomed: boolean) => void;
  onSingleTap: () => void;
  onLongPressIn?: () => void;
  onLongPressOut?: () => void;
  children: React.ReactNode;
}) {
  const scale = useSharedValue(1);
  const saved = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const sx = useSharedValue(0);
  const sy = useSharedValue(0);

  useEffect(() => {
    if (!active) {
      scale.value = 1;
      saved.value = 1;
      tx.value = 0;
      ty.value = 0;
    }
  }, [active, scale, saved, tx, ty]);

  const clamp = (s: number) => {
    'worklet';
    const maxX = (width * (s - 1)) / 2;
    const maxY = (height * (s - 1)) / 2;
    tx.value = Math.min(maxX, Math.max(-maxX, tx.value));
    ty.value = Math.min(maxY, Math.max(-maxY, ty.value));
  };

  const pinch = Gesture.Pinch()
    .onUpdate((e) => {
      scale.value = Math.max(0.8, Math.min(MAX, saved.value * e.scale));
    })
    .onEnd(() => {
      if (scale.value < 1) {
        scale.value = withSpring(1, motion.spring.snappy);
        tx.value = withSpring(0);
        ty.value = withSpring(0);
        saved.value = 1;
      } else {
        saved.value = scale.value;
        clamp(scale.value);
      }
      runOnJS(onZoomChange)(saved.value > 1.01);
    });

  const pan = Gesture.Pan()
    .averageTouches(true)
    .manualActivation(true)
    .onTouchesMove((_e, state) => {
      if (saved.value > 1.01) state.activate();
      else state.fail();
    })
    .onStart(() => {
      sx.value = tx.value;
      sy.value = ty.value;
    })
    .onUpdate((e) => {
      tx.value = sx.value + e.translationX;
      ty.value = sy.value + e.translationY;
    })
    .onEnd(() => clamp(saved.value));

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd((e) => {
      if (saved.value > 1.01) {
        scale.value = withTiming(1, { duration: 220 });
        tx.value = withTiming(0, { duration: 220 });
        ty.value = withTiming(0, { duration: 220 });
        saved.value = 1;
        runOnJS(onZoomChange)(false);
      } else {
        const s = 2.5;
        scale.value = withTiming(s, { duration: 240 });
        tx.value = withTiming((width / 2 - e.x) * (s - 1), { duration: 240 });
        ty.value = withTiming((height / 2 - e.y) * (s - 1), { duration: 240 });
        saved.value = s;
        runOnJS(onZoomChange)(true);
      }
    });

  const singleTap = Gesture.Tap()
    .requireExternalGestureToFail(doubleTap)
    .onEnd(() => runOnJS(onSingleTap)());

  const longPress = Gesture.LongPress()
    .minDuration(250)
    .enabled(!!onLongPressIn)
    .onStart(() => onLongPressIn && runOnJS(onLongPressIn)())
    .onFinalize(() => onLongPressOut && runOnJS(onLongPressOut)());

  const gesture = Gesture.Race(Gesture.Simultaneous(pinch, pan), Gesture.Exclusive(doubleTap, singleTap), longPress);

  const style = useAnimatedStyle(() => ({ transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: scale.value }] }));

  return (
    <GestureDetector gesture={gesture}>
      <View style={{ width, height, overflow: 'hidden' }} collapsable={false}>
        <Animated.View style={[StyleSheet.absoluteFill, style]}>{children}</Animated.View>
      </View>
    </GestureDetector>
  );
}
