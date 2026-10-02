/**
 * Client-side mirror of the plan constants. The server (public.plan_limits) is authoritative and
 * enforces them; these are used only for copy and optimistic UI before usage has loaded.
 */
export const FREE_PLAN = {
  maxAlbums: 3,
  maxStorageBytes: 15 * 1024 ** 3,
  warnRatio: 0.8,
} as const;

export const UPLOAD = {
  /** Supabase Storage's TUS endpoint requires 6 MiB chunks (all but the last). */
  chunkSize: 6 * 1024 * 1024,
  concurrency: 2,
  maxAttempts: 8,
  /** Backoff: base * 2^attempt, capped. */
  backoffBaseMs: 1500,
  backoffMaxMs: 60_000,
  thumbWidth: 480,
  /** Viewer rendition (JPEG). Originals are untouched; this only speeds up viewing and works on web. */
  previewWidth: 1600,
  previewQuality: 0.82,
  thumbQuality: 0.72,
  /** Bigger than this, we show "Wi-Fi recommended" in the review screen. */
  wifiRecommendedBytes: 500 * 1024 * 1024,
} as const;
