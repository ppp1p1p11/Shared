/// <reference types="jest" />
import { backoffMs, classifyFailure, pickRunnable, recoverAfterRestart, summarize } from '@/features/upload/logic';
import type { UploadItem } from '@/features/upload/types';

const item = (id: string, state: UploadItem['state'], extra: Partial<UploadItem> = {}): UploadItem => ({
  id,
  albumId: 'a',
  createdAt: Number(id),
  source: { uri: 'x', filename: 'x.heic', kind: 'photo', sizeHint: 100 },
  state,
  bytesTotal: 100,
  bytesSent: 0,
  attempts: 0,
  ...extra,
});

describe('upload queue logic', () => {
  it('respects concurrency and backoff, oldest first', () => {
    const items = [item('3', 'queued'), item('1', 'uploading'), item('2', 'queued'), item('4', 'queued', { nextAttemptAt: 10_000 })];
    expect(pickRunnable(items, 0, 2).map((i) => i.id)).toEqual(['2']);
    expect(pickRunnable(items, 0, 3).map((i) => i.id)).toEqual(['2', '3']);
    expect(pickRunnable(items, 20_000, 4).map((i) => i.id)).toEqual(['2', '3', '4']);
  });

  it('backs off exponentially with a cap', () => {
    const mid = () => 0.5;
    expect(backoffMs(1, mid)).toBe(1500);
    expect(backoffMs(3, mid)).toBe(6000);
    expect(backoffMs(30, mid)).toBe(60_000);
  });

  it('classifies failures so nothing queued is ever lost', () => {
    expect(classifyFailure(new Error('ROLO:quota_exceeded'))).toBe('quota');
    expect(classifyFailure(new Error('Network request failed'))).toBe('offline');
    expect(classifyFailure(new Error('ROLO:not_a_member'))).toBe('fatal');
    expect(classifyFailure(Object.assign(new Error('x'), { status: 503 }))).toBe('retry');
    expect(classifyFailure(Object.assign(new Error('x'), { status: 409 }))).toBe('retry');
    expect(classifyFailure(Object.assign(new Error('x'), { status: 400 }))).toBe('fatal');
  });

  it('summarizes progress for the pill (byte-weighted)', () => {
    const s = summarize([item('1', 'done'), item('2', 'uploading', { bytesSent: 50 }), item('3', 'queued'), item('4', 'duplicate')]);
    expect(s.total).toBe(4);
    expect(s.done).toBe(2);
    expect(s.progress).toBeCloseTo(250 / 400);
    expect(s.allDone).toBe(false);
  });

  it('requeues in-flight work after a restart', () => {
    const r = recoverAfterRestart([item('1', 'uploading'), item('2', 'done'), item('3', 'paused_quota')]);
    expect(r.map((i) => i.state)).toEqual(['queued', 'done', 'paused_quota']);
  });
});
