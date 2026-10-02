/// <reference types="jest" />
import { buildGrid, nextDensity } from '@/features/media/grid';
import type { Media } from '@/lib/types';

const m = (id: string, captured: string, uploader = 'u1'): Media =>
  ({ id, album_id: 'a', uploader_id: uploader, kind: 'photo', storage_path: '', thumb_path: '', thumbhash: null, mime_type: 'image/heic', width: 1, height: 1, duration_ms: null, size_bytes: 1, live_photo_video_path: null, original_filename: null, captured_at: captured, status: 'ready', created_at: captured }) as Media;

describe('buildGrid', () => {
  it('groups by capture day (newest first) into rows with sticky header indices', () => {
    const media = [m('a', '2026-01-10T12:00:00'), m('b', '2026-01-12T09:00:00'), m('c', '2026-01-12T18:00:00'), m('d', '2026-01-12T10:00:00'), m('e', '2026-01-12T11:00:00')];
    const g = buildGrid(media, [], 3);
    expect(g.rows.map((r) => (r.type === 'header' ? `H${r.count}` : r.cells.map((c) => c.key).join('')))).toEqual(['H4', 'ced', 'b', 'H1', 'a']);
    expect(g.headerIndices).toEqual([0, 3]);
    expect(g.position.get('b')).toEqual({ row: 2, col: 0 });
    expect(g.flat.map((c) => c.key)).toEqual(['c', 'e', 'd', 'b', 'a']);
  });

  it('shows optimistic uploads until the server item arrives, then dedupes', () => {
    const upload: any = { id: 'q1', state: 'uploading', source: { capturedAt: '2026-01-12T20:00:00' }, createdAt: 1, server: { mediaId: 'x' } };
    expect(buildGrid([], [upload], 3).flat.map((c) => c.key)).toEqual(['local-q1']);
    expect(buildGrid([m('x', '2026-01-12T20:00:00')], [upload], 3).flat.map((c) => c.key)).toEqual(['x']);
  });

  it('filters by contributor', () => {
    const g = buildGrid([m('a', '2026-01-10T12:00:00', 'ana'), m('b', '2026-01-10T13:00:00', 'joao')], [], 3, (c) => c.uploaderId === 'ana');
    expect(g.flat.map((c) => c.key)).toEqual(['a']);
  });

  it('handles 5,000 items quickly', () => {
    const many = Array.from({ length: 5000 }, (_, i) => m(`id${i}`, new Date(Date.UTC(2026, 0, 1) + i * 600_000).toISOString()));
    const t = Date.now();
    const g = buildGrid(many, [], 5);
    expect(Date.now() - t).toBeLessThan(500);
    expect(g.flat).toHaveLength(5000);
  });
});

describe('nextDensity', () => {
  it('pinch out → bigger photos, pinch in → denser grid', () => {
    expect(nextDensity(3, 1.4)).toBe(2);
    expect(nextDensity(3, 0.6)).toBe(5);
    expect(nextDensity(7, 0.5)).toBe(7);
    expect(nextDensity(3, 1.05)).toBe(3);
  });
});
