import { UPLOAD } from '@/config/limits';
import { errorCode } from '@/lib/errors';
import type { UploadItem, UploadState } from './types';

export const ACTIVE: UploadState[] = ['preparing', 'uploading', 'finalizing'];
export const TERMINAL: UploadState[] = ['done', 'duplicate', 'failed'];

/** Exponential backoff with jitter, capped. */
export function backoffMs(attempt: number, rand = Math.random): number {
  const base = Math.min(UPLOAD.backoffMaxMs, UPLOAD.backoffBaseMs * 2 ** Math.max(0, attempt - 1));
  return Math.round(base * (0.75 + rand() * 0.5));
}

export type Failure = 'retry' | 'quota' | 'fatal' | 'offline' | 'auth';

/** Decide what to do with an error thrown while processing an item. */
export function classifyFailure(err: unknown): Failure {
  const status = (err as { status?: number })?.status;
  const code = errorCode(err);
  if (code === 'quota_exceeded') return 'quota';
  if (code === 'offline') return 'offline';
  if (code === 'not_authenticated') return 'auth';
  if (code === 'not_a_member' || code === 'removed' || code === 'media_not_found') return 'fatal';
  if (status === 413) return 'quota';
  if (status && status >= 400 && status < 500 && ![401, 408, 409, 423, 429].includes(status)) return 'fatal';
  return 'retry';
}

/** Items to start now, oldest first, respecting concurrency and backoff. */
export function pickRunnable(items: UploadItem[], now: number, concurrency: number = UPLOAD.concurrency): UploadItem[] {
  const running = items.filter((i) => ACTIVE.includes(i.state)).length;
  const slots = Math.max(0, concurrency - running);
  if (!slots) return [];
  return items
    .filter((i) => i.state === 'queued' && (!i.nextAttemptAt || i.nextAttemptAt <= now))
    .sort((a, b) => a.createdAt - b.createdAt)
    .slice(0, slots);
}

export type QueueSummary = {
  total: number; // items in the current batch (not yet cleared)
  done: number; // finished (uploaded or duplicate)
  failed: number;
  pausedQuota: number;
  active: number;
  bytesTotal: number;
  bytesSent: number;
  progress: number; // 0..1, byte-weighted
  allDone: boolean;
};

export function summarize(items: UploadItem[]): QueueSummary {
  const done = items.filter((i) => i.state === 'done' || i.state === 'duplicate').length;
  const failed = items.filter((i) => i.state === 'failed').length;
  const pausedQuota = items.filter((i) => i.state === 'paused_quota').length;
  const active = items.filter((i) => ACTIVE.includes(i.state) || i.state === 'queued').length;
  const bytesTotal = items.reduce((s, i) => s + (i.bytesTotal || i.source.sizeHint || 0), 0);
  const bytesSent = items.reduce((s, i) => s + (i.state === 'done' || i.state === 'duplicate' ? i.bytesTotal || i.source.sizeHint || 0 : i.bytesSent), 0);
  return {
    total: items.length,
    done,
    failed,
    pausedQuota,
    active,
    bytesTotal,
    bytesSent,
    progress: bytesTotal > 0 ? Math.min(1, bytesSent / bytesTotal) : items.length ? done / items.length : 0,
    allDone: items.length > 0 && active === 0 && pausedQuota === 0 && failed === 0,
  };
}

/** On app start, anything that was mid-flight goes back to the queue (it resumes from the TUS offset). */
export function recoverAfterRestart(items: UploadItem[]): UploadItem[] {
  return items.map((i) => (ACTIVE.includes(i.state) ? { ...i, state: 'queued' as const, nextAttemptAt: undefined } : i));
}
