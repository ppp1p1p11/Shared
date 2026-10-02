import { dayKey } from '@/lib/format';
import type { Media } from '@/lib/types';
import type { UploadItem } from '@/features/upload/types';

export type Cell = { key: string; media?: Media; upload?: UploadItem; capturedAt: string; uploaderId: string };
export type Row =
  | { type: 'header'; key: string; day: string; count: number }
  | { type: 'cells'; key: string; cells: Cell[]; day: string };

export type GridModel = {
  rows: Row[];
  headerIndices: number[];
  /** Flat, display-ordered list (what the viewer pages through). */
  flat: Cell[];
  /** cell key → { row, col } for measuring thumbnails (viewer transitions). */
  position: Map<string, { row: number; col: number }>;
};

/**
 * Merge server media with local (optimistic) uploads, newest capture date first, grouped by
 * the day the photo was TAKEN (not uploaded), then chunked into rows of `columns`.
 */
export function buildGrid(media: Media[], uploads: UploadItem[], columns: number, filter: (c: Cell) => boolean = () => true): GridModel {
  const serverIds = new Set(media.map((m) => m.id));
  const cells: Cell[] = [];
  for (const m of media) cells.push({ key: m.id, media: m, capturedAt: m.captured_at, uploaderId: m.uploader_id });
  for (const u of uploads) {
    if (u.state === 'duplicate' || u.state === 'failed') continue;
    if (u.mediaId && serverIds.has(u.mediaId)) continue; // settled: the server item replaces the local tile
    if (u.server?.mediaId && serverIds.has(u.server.mediaId)) continue;
    cells.push({ key: `local-${u.id}`, upload: u, capturedAt: u.staged?.capturedAt ?? u.source.capturedAt ?? new Date(u.createdAt).toISOString(), uploaderId: '__me__' });
  }
  const visible = cells.filter(filter).sort((a, b) => (a.capturedAt < b.capturedAt ? 1 : a.capturedAt > b.capturedAt ? -1 : a.key < b.key ? 1 : -1));

  const rows: Row[] = [];
  const headerIndices: number[] = [];
  const position = new Map<string, { row: number; col: number }>();
  let i = 0;
  while (i < visible.length) {
    const day = dayKey(new Date(visible[i].capturedAt));
    let j = i;
    while (j < visible.length && dayKey(new Date(visible[j].capturedAt)) === day) j++;
    headerIndices.push(rows.length);
    rows.push({ type: 'header', key: `h-${day}`, day, count: j - i });
    for (let k = i; k < j; k += columns) {
      const slice = visible.slice(k, Math.min(j, k + columns));
      const rowIndex = rows.length;
      slice.forEach((c, col) => position.set(c.key, { row: rowIndex, col }));
      rows.push({ type: 'cells', key: `r-${day}-${k - i}`, cells: slice, day });
    }
    i = j;
  }
  return { rows, headerIndices, flat: visible, position };
}

export const DENSITIES = [2, 3, 5, 7] as const;

export function nextDensity(current: number, pinchScale: number): number {
  const idx = DENSITIES.indexOf(current as (typeof DENSITIES)[number]);
  const i = idx < 0 ? 1 : idx;
  if (pinchScale > 1.15) return DENSITIES[Math.max(0, i - 1)];
  if (pinchScale < 0.87) return DENSITIES[Math.min(DENSITIES.length - 1, i + 1)];
  return current;
}
