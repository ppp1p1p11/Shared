import i18n from '@/i18n';

export const KNOWN_ERRORS = [
  'not_authenticated',
  'invalid_link',
  'album_locked',
  'link_expired',
  'removed',
  'not_a_member',
  'not_owner',
  'album_limit_reached',
  'quota_exceeded',
  'name_required',
  'media_not_found',
  'owner_cannot_leave',
  'cannot_remove_owner',
] as const;
export type ErrorCode = (typeof KNOWN_ERRORS)[number] | 'offline' | 'generic';

/** Extracts the server's ROLO:<code> (or detects network failure). */
export function errorCode(err: unknown): ErrorCode {
  const msg = String((err as any)?.message ?? err ?? '');
  const m = /ROLO:([a-z_]+)/.exec(msg);
  if (m && (KNOWN_ERRORS as readonly string[]).includes(m[1])) return m[1] as ErrorCode;
  if (/network|fetch failed|Failed to fetch|Network request failed|timeout|offline/i.test(msg)) return 'offline';
  return 'generic';
}

/** Human, translated message that says what happened and what to do next. */
export function errorMessage(err: unknown): string {
  return i18n.t(`errors.${errorCode(err)}` as any);
}

export class RoloError extends Error {
  constructor(public code: ErrorCode) {
    super(`ROLO:${code}`);
  }
}
