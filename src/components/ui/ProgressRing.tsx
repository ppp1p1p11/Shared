import { useEffect } from 'react';
import Animated, { useAnimatedProps, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/** Thin determinate progress ring (0..1). */
export function ProgressRing({
  progress,
  size = 22,
  stroke = 2.5,
  color,
  track,
}: {
  progress: number;
  size?: number;
  stroke?: number;
  color: string;
  track: string;
}) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const p = useSharedValue(progress);
  useEffect(() => {
    p.value = withTiming(Math.max(0, Math.min(1, progress)), { duration: 240 });
  }, [progress, p]);
  const animatedProps = useAnimatedProps(() => ({ strokeDashoffset: circ * (1 - p.value) }));
  return (
    <Svg width={size} height={size} accessibilityRole="progressbar">
      <Circle cx={size / 2} cy={size / 2} r={r} stroke={track} strokeWidth={stroke} fill="none" />
      <AnimatedCircle
        cx={size / 2}
        cy={size / 2}
        r={r}
        stroke={color}
        strokeWidth={stroke}
        fill="none"
        strokeLinecap="round"
        strokeDasharray={`${circ} ${circ}`}
        animatedProps={animatedProps}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </Svg>
  );
}
