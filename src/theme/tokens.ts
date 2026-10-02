/**
 * Rolo design tokens. Every component reads from these. Screens never hardcode a color, size or duration.
 *
 * Contrast (WCAG 2.1), verified:
 *   light  text/bg 18.9 · textSecondary/bg 6.5 · textTertiary/bg 5.1 · onAccent/accent 4.9
 *   dark   text/bg 19.4 · textSecondary/bg 8.3 · textTertiary/bg 6.4 · onAccent/accent 6.8
 */
import { Easing } from 'react-native-reanimated';

const palette = {
  white: '#FFFFFF',
  black: '#000000',
  ink: '#111110',
  coral600: '#CC3D25',
  coral400: '#FF6B4A',
  coralInk: '#1A0A05',
};

export type ColorTokens = {
  bg: string; // app canvas
  bgPhoto: string; // behind photos — true black in dark mode
  surface: string; // cards, inputs
  surfaceRaised: string; // sheets, popovers
  surfacePressed: string;
  separator: string;
  border: string;
  text: string;
  textSecondary: string;
  textTertiary: string;
  textInverse: string;
  accent: string;
  accentPressed: string;
  accentSoft: string; // tinted background for accent chips/progress tracks
  onAccent: string;
  success: string;
  successSoft: string;
  warning: string;
  warningSoft: string;
  danger: string;
  dangerSoft: string;
  overlay: string; // modal scrim
  scrimTop: string; // gradient over photos for legible chrome
  skeleton: string;
  skeletonHighlight: string;
  qrForeground: string;
  qrBackground: string;
  avatar: readonly string[];
};

export const lightColors: ColorTokens = {
  bg: palette.white,
  bgPhoto: '#F2F2EF',
  surface: '#F4F4F1',
  surfaceRaised: palette.white,
  surfacePressed: '#E9E9E5',
  separator: 'rgba(17,17,16,0.08)',
  border: 'rgba(17,17,16,0.12)',
  text: palette.ink,
  textSecondary: '#5E5E59',
  textTertiary: '#6E6E69',
  textInverse: palette.white,
  accent: palette.coral600,
  accentPressed: '#B23420',
  accentSoft: 'rgba(204,61,37,0.10)',
  onAccent: palette.white,
  success: '#1E7A46',
  successSoft: 'rgba(30,122,70,0.10)',
  warning: '#8F5600',
  warningSoft: 'rgba(214,140,20,0.14)',
  danger: '#C4281C',
  dangerSoft: 'rgba(196,40,28,0.10)',
  overlay: 'rgba(0,0,0,0.32)',
  scrimTop: 'rgba(0,0,0,0.45)',
  skeleton: '#EDEDEA',
  skeletonHighlight: '#F6F6F3',
  qrForeground: palette.ink,
  qrBackground: palette.white,
  avatar: ['#CC3D25', '#2F6FDB', '#1E7A46', '#8A4FD0', '#C27A00', '#0F8A8A', '#C2417A', '#55606E'],
};

export const darkColors: ColorTokens = {
  bg: palette.black,
  bgPhoto: palette.black,
  surface: '#141414',
  surfaceRaised: '#1C1C1C',
  surfacePressed: '#262626',
  separator: 'rgba(255,255,255,0.08)',
  border: 'rgba(255,255,255,0.14)',
  text: '#F5F5F2',
  textSecondary: '#A3A39D',
  textTertiary: '#8E8E88',
  textInverse: palette.ink,
  accent: palette.coral400,
  accentPressed: '#F25C3B',
  accentSoft: 'rgba(255,107,74,0.16)',
  onAccent: palette.coralInk,
  success: '#4CC384',
  successSoft: 'rgba(76,195,132,0.16)',
  warning: '#F2B544',
  warningSoft: 'rgba(242,181,68,0.16)',
  danger: '#FF6A5E',
  dangerSoft: 'rgba(255,106,94,0.16)',
  overlay: 'rgba(0,0,0,0.6)',
  scrimTop: 'rgba(0,0,0,0.55)',
  skeleton: '#161616',
  skeletonHighlight: '#202020',
  qrForeground: palette.ink,
  qrBackground: palette.white,
  avatar: ['#FF6B4A', '#5B93F5', '#4CC384', '#A97BF0', '#F2B544', '#3CC6C6', '#F06BA8', '#9AA6B4'],
};

/** 4pt grid. */
export const space = {
  0: 0,
  0.5: 2,
  1: 4,
  1.5: 6,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
  16: 64,
} as const;

export const radius = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  pill: 999,
} as const;

/** Type scale. Sizes scale with Dynamic Type via allowFontScaling (capped in Text). */
export const type = {
  display: { fontSize: 34, lineHeight: 40, fontWeight: '700', letterSpacing: -0.6 },
  title1: { fontSize: 28, lineHeight: 34, fontWeight: '700', letterSpacing: -0.4 },
  title2: { fontSize: 22, lineHeight: 28, fontWeight: '600', letterSpacing: -0.3 },
  title3: { fontSize: 19, lineHeight: 24, fontWeight: '600', letterSpacing: -0.2 },
  headline: { fontSize: 17, lineHeight: 22, fontWeight: '600', letterSpacing: -0.2 },
  body: { fontSize: 17, lineHeight: 24, fontWeight: '400', letterSpacing: -0.2 },
  callout: { fontSize: 16, lineHeight: 22, fontWeight: '400', letterSpacing: -0.1 },
  subhead: { fontSize: 15, lineHeight: 20, fontWeight: '400', letterSpacing: -0.1 },
  footnote: { fontSize: 13, lineHeight: 18, fontWeight: '400', letterSpacing: 0 },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '500', letterSpacing: 0.1 },
  overline: { fontSize: 11, lineHeight: 14, fontWeight: '600', letterSpacing: 0.6 },
} as const;

export type TypeVariant = keyof typeof type;

export const elevation = {
  none: { shadowOpacity: 0, elevation: 0 },
  card: {
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  floating: {
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
} as const;

export const motion = {
  duration: { instant: 100, fast: 180, base: 260, slow: 380 },
  easing: {
    standard: Easing.bezier(0.2, 0, 0, 1),
    decelerate: Easing.bezier(0, 0, 0, 1),
    accelerate: Easing.bezier(0.3, 0, 1, 1),
  },
  spring: {
    /** UI elements: quick, no visible bounce. */
    snappy: { damping: 26, stiffness: 320, mass: 1 },
    /** Sheets, cards entering. */
    gentle: { damping: 22, stiffness: 180, mass: 1 },
    /** Photo viewer open/close. */
    viewer: { damping: 28, stiffness: 240, mass: 0.9 },
  },
} as const;

export const layout = {
  minTouch: 44,
  gutter: 20,
  gridGap: 2,
  maxContentWidth: 560,
} as const;

export const iconSize = { sm: 18, md: 22, lg: 28, xl: 40 } as const;
export const iconStroke = 1.75;
