import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';

import { currentLocale } from '@/i18n';
import { haptics } from '@/lib/haptics';
import { capitalizeFirst, parseLocalDate, toISODate } from '@/lib/format';
import { useColors } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';
import { IconButton } from './IconButton';
import { Text } from './Text';

type Range = { start: string | null; end: string | null };

/** Compact month calendar for picking a trip's date range. Tap start, tap end. */
export function DateRangeCalendar({ value, onChange }: { value: Range; onChange: (r: Range) => void }) {
  const c = useColors();
  const { t } = useTranslation();
  const locale = currentLocale();
  const initial = value.start ? parseLocalDate(value.start) : new Date();
  const [month, setMonth] = useState(new Date(initial.getFullYear(), initial.getMonth(), 1));

  const weekdays = useMemo(() => {
    // Locale-aware first day of week: Sunday for pt-BR and en-US.
    const base = new Date(2026, 0, 4); // a Sunday
    return Array.from({ length: 7 }, (_, i) =>
      new Intl.DateTimeFormat(locale, { weekday: 'narrow' }).format(new Date(base.getFullYear(), 0, 4 + i)),
    );
  }, [locale]);

  const cells = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    const out: (Date | null)[] = Array(first.getDay()).fill(null);
    for (let d = 1; d <= days; d++) out.push(new Date(month.getFullYear(), month.getMonth(), d));
    while (out.length % 7) out.push(null);
    return out;
  }, [month]);

  const title = capitalizeFirst(new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(month));
  const todayKey = toISODate(new Date());

  const pick = (d: Date) => {
    haptics.tick();
    const key = toISODate(d);
    if (!value.start || (value.start && value.end)) return onChange({ start: key, end: null });
    if (key < value.start) return onChange({ start: key, end: value.start });
    onChange({ start: value.start, end: key });
  };

  const inRange = (key: string) => value.start && value.end && key > value.start && key < value.end;

  return (
    <Animated.View entering={FadeIn.duration(200)} style={{ gap: space[2] }}>
      <View style={styles.nav}>
        <IconButton icon="back" size="sm" label="Previous month" onPress={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} />
        <Text variant="headline" accessibilityLiveRegion="polite">
          {title}
        </Text>
        <IconButton icon="chevron" size="sm" label="Next month" onPress={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} />
      </View>
      <View style={styles.week}>
        {weekdays.map((w, i) => (
          <Text key={i} variant="caption" color="textTertiary" align="center" style={styles.cellW}>
            {w}
          </Text>
        ))}
      </View>
      <View style={styles.grid}>
        {cells.map((d, i) => {
          if (!d) return <View key={i} style={styles.cell} />;
          const key = toISODate(d);
          const isStart = key === value.start;
          const isEnd = key === value.end;
          const selected = isStart || isEnd;
          const mid = inRange(key);
          const label = new Intl.DateTimeFormat(locale, { dateStyle: 'full' }).format(d);
          return (
            <View key={i} style={styles.cell}>
              {(mid || (isStart && value.end) || (isEnd && value.start)) && (
                <View
                  style={[
                    styles.band,
                    { backgroundColor: c.accentSoft },
                    isStart && { left: '50%' },
                    isEnd && { right: '50%' },
                  ]}
                />
              )}
              <Pressable
                onPress={() => pick(d)}
                accessibilityRole="button"
                accessibilityLabel={label}
                accessibilityState={{ selected }}
                style={[styles.day, selected && { backgroundColor: c.accent }]}
              >
                <Text
                  variant="callout"
                  weight={selected || key === todayKey ? '600' : '400'}
                  color={selected ? 'onAccent' : key === todayKey ? 'accent' : 'text'}
                  tabular
                >
                  {d.getDate()}
                </Text>
              </Pressable>
            </View>
          );
        })}
      </View>
      {(value.start || value.end) && (
        <Pressable onPress={() => onChange({ start: null, end: null })} accessibilityRole="button" style={{ alignSelf: 'center', padding: space[2] }}>
          <Text variant="subhead" color="accent" weight="500">
            {t('create.clearDates')}
          </Text>
        </Pressable>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  nav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  week: { flexDirection: 'row' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cellW: { width: `${100 / 7}%` },
  cell: { width: `${100 / 7}%`, height: 44, alignItems: 'center', justifyContent: 'center' },
  band: { position: 'absolute', left: 0, right: 0, top: 4, bottom: 4 },
  day: { width: 40, height: 40, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
});
