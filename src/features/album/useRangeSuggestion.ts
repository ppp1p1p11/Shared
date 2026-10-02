import { useEffect, useState } from 'react';

import { parseLocalDate } from '@/lib/format';
import type { Album } from '@/lib/types';
import { countAssetsInRange } from './libraryRange';

/**
 * "Add your 143 photos from Jan 10–15?" Counts only when photo access was already granted:
 * we never trigger a permission prompt just to show a suggestion.
 */
export function useRangeSuggestion(album: Album | undefined, enabled: boolean) {
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    if (!album?.start_date || !enabled) return;
    const start = parseLocalDate(album.start_date);
    const end = parseLocalDate(album.end_date ?? album.start_date);
    end.setHours(23, 59, 59, 999);
    countAssetsInRange(start, end).then(setCount).catch(() => setCount(null));
  }, [album?.start_date, album?.end_date, enabled]);
  return count;
}
