import type { MediaKind } from '@/lib/types';

export type UploadState =
  | 'queued' // waiting for a slot
  | 'preparing' // copying original, hashing, stripping location, making thumbnail
  | 'uploading' // bytes in flight (original → live video → thumbnail)
  | 'finalizing' // telling the server it's done (runs the moderation hook)
  | 'done'
  | 'duplicate' // same bytes already in the album
  | 'paused_quota' // owner's storage is full — kept, resumes when there's room
  | 'failed'; // gave up after retries (user can retry)

/** What the user picked, as reported by the picker / media library. */
export type UploadSource = {
  /** Media library id (native). Lets us re-resolve the original after a restart. */
  assetId?: string | null;
  /** Something displayable/readable now: ph://, content://, file://, blob: */
  uri: string;
  filename: string;
  mimeType?: string | null;
  kind: MediaKind;
  width?: number | null;
  height?: number | null;
  durationMs?: number | null;
  capturedAt?: string | null;
  sizeHint?: number | null;
  /** iOS Live Photo: URI of the paired video, if known at pick time. */
  livePhotoUri?: string | null;
};

export type Staged = {
  originalUri: string;
  size: number;
  mimeType: string;
  ext: string;
  contentHash: string;
  capturedAt: string;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  liveUri?: string | null;
  liveSize?: number;
  thumbUri?: string | null;
  previewUri?: string | null;
  thumbhash?: string | null;
  /** Thumbnail generation failed (e.g. HEIC in a desktop browser); the original still uploads. */
  thumbFailed?: boolean;
  locationRemoved?: string[];
};

export type ServerSlot = { mediaId: string; storagePath: string; thumbPath: string; previewPath: string; livePath: string | null; keepLocation: boolean };

export type TusSession = { uploadUrl: string; offset: number; size: number };

export type UploadItem = {
  id: string;
  albumId: string;
  createdAt: number;
  source: UploadSource;
  state: UploadState;
  bytesTotal: number;
  bytesSent: number;
  attempts: number;
  nextAttemptAt?: number;
  error?: string;
  staged?: Staged;
  server?: ServerSlot;
  tus?: { original?: TusSession; live?: TusSession };
  thumbUploaded?: boolean;
  previewUploaded?: boolean;
  /** Set when done; lets the grid swap the optimistic tile for the server item. */
  mediaId?: string;
};
