/**
 * Storage abstraction. The UI and upload queue only talk to this interface, so Supabase
 * Storage can be swapped for Cloudflare R2 (presigned multipart URLs) without touching screens:
 *   createResumable  → R2: CreateMultipartUpload + presign part URLs
 *   uploadChunk      → R2: PUT part to presigned URL (ETag kept in the session)
 *   getOffset        → R2: ListParts
 *   imageSource      → R2: presigned GET (or a Worker that checks the Supabase JWT)
 */
export type ChunkBody =
  | { kind: 'file'; uri: string } // native: a temp file holding exactly this chunk
  | { kind: 'bytes'; data: Uint8Array | Blob }; // web / tests

export type ResumableTarget = { uploadUrl: string; chunkSize: number };

export type ImageSourceSpec = { uri: string; headers?: Record<string, string>; cacheKey: string };

export interface StorageProvider {
  readonly name: string;
  createResumable(p: { path: string; size: number; contentType: string }): Promise<ResumableTarget>;
  /** Server-confirmed offset, or null when the session is gone (caller restarts the object). */
  getOffset(uploadUrl: string): Promise<number | null>;
  uploadChunk(p: {
    uploadUrl: string;
    offset: number;
    length: number;
    body: ChunkBody;
    onProgress?: (sentInChunk: number) => void;
    signal?: AbortSignal;
  }): Promise<number>;
  uploadSmall(p: { path: string; body: ChunkBody; contentType: string }): Promise<void>;
  /** Synchronous display source for thumbnails/originals (native). */
  imageSource(path: string): ImageSourceSpec | null;
  /** Short-lived URL to fetch the original bytes (saving to device, video playback). */
  downloadUrl(path: string, expiresInSeconds?: number): Promise<string>;
  downloadUrls(paths: string[], expiresInSeconds?: number): Promise<Record<string, string>>;
  remove(paths: string[]): Promise<void>;
}

export class UploadHttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
  /** 4xx (except 408/409/423/429) won't succeed on retry. */
  get permanent() {
    return this.status >= 400 && this.status < 500 && ![408, 409, 423, 429].includes(this.status);
  }
}
