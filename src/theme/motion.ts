import { useReducedMotion, withSpring, withTiming, type WithSpringConfig } from 'react-native-reanimated';

import { motion } from './tokens';

/** Spring that collapses to an instant change when the OS "Reduce Motion" setting is on. */
export function useMotion() {
  const reduced = useReducedMotion();
  return {
    reduced,
    spring: (to: number, config: WithSpringConfig = motion.spring.snappy) => {
      'worklet';
      return reduced ? withTiming(to, { duration: 0 }) : withSpring(to, config);
    },
    timing: (to: number, duration: number = motion.duration.base) => {
      'worklet';
      return withTiming(to, { duration: reduced ? 0 : duration, easing: motion.easing.standard });
    },
  };
}
