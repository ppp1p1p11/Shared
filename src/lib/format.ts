import i18n, { currentLocale } from '@/i18n';

/** 1.8 GB / 1,8 GB, using decimal-ish units people recognise from their phones (base 1024). */
export function formatBytes(bytes: number, locale = currentLocale()): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return locale.startsWith('pt') ? '0 KB' : '0 KB';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  let value = bytes / Math.pow(1024, i);
  if (value >= 1000 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }
  const digits = value < 10 && i >= 2 ? 1 : 0;
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(value)} ${units[i]}`;
}

export function formatDuration(ms: number | null | undefined): string {
  if (!ms || ms < 0) return '0:00';
  const total = Math.round(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/** Parses 'YYYY-MM-DD' as a local calendar date (no timezone shift). */
export function parseLocalDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

export function toISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** "Jan 10–15", "10–15 de jan.", "Dec 30 – Jan 2, 2027". */
export function formatDateRange(start?: string | null, end?: string | null, locale = currentLocale()): string | null {
  if (!start && !end) return null;
  const s = parseLocalDate((start ?? end)!);
  const e = parseLocalDate((end ?? start)!);
  const now = new Date();
  const showYear = s.getFullYear() !== now.getFullYear() || e.getFullYear() !== s.getFullYear();
  const fmt = new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', ...(showYear ? { year: 'numeric' } : {}) });
  if (+s === +e) return fmt.format(s);
  // Intl.formatRange gives the most natural output where available ("10–15 de jan.").
  const anyFmt = fmt as Intl.DateTimeFormat & { formatRange?: (a: Date, b: Date) => string };
  if (typeof anyFmt.formatRange === 'function') return anyFmt.formatRange(s, e);
  return i18n.t('time.dateRange', { start: fmt.format(s), end: fmt.format(e) });
}

/** Sentence case: 'qui., 15 de jan.' → 'Qui., 15 de jan.' (title case would read 'De Jan.'). */
export const capitalizeFirst = (s: string) => (s ? s[0].toLocaleUpperCase() + s.slice(1) : s);

export function dayKey(d: Date): string {
  return toISODate(d);
}

/** Header label for a day group: Today / Yesterday / Sat, Jan 10 / Sat, Jan 10, 2025. */
export function formatDayHeader(key: string, locale = currentLocale()): string {
  const d = parseLocalDate(key);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((+today - +d) / 86_400_000);
  if (diff === 0) return i18n.t('album.today');
  if (diff === 1) return i18n.t('album.yesterday');
  const sameYear = d.getFullYear() === today.getFullYear();
  return capitalizeFirst(
    new Intl.DateTimeFormat(locale, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      ...(sameYear ? {} : { year: 'numeric' }),
    }).format(d),
  );
}

export function formatDateTime(iso: string, locale = currentLocale()): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
}

export function formatShortDate(iso: string, locale = currentLocale()): string {
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(new Date(iso));
}

/** "in 23 hours", "em 2 dias". */
export function formatRelativeFuture(iso: string, locale = currentLocale()): string {
  const ms = new Date(iso).getTime() - Date.now();
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  const hours = Math.round(ms / 3_600_000);
  if (Math.abs(hours) < 48) return rtf.format(Math.max(hours, 0), 'hour');
  return rtf.format(Math.round(hours / 24), 'day');
}

export function initials(name: string | null | undefined): string {
  const clean = (name ?? '').trim();
  if (!clean) return '·';
  const parts = clean.split(/\s+/).filter(Boolean);
  const first = Array.from(parts[0])[0] ?? '';
  const last = parts.length > 1 ? (Array.from(parts[parts.length - 1])[0] ?? '') : '';
  return (first + last).toUpperCase();
}
