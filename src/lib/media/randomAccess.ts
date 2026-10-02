/** Minimal random-access file interface so binary patchers work on device files, web Blobs and test buffers. */
export interface RandomAccess {
  readonly size: number;
  read(offset: number, length: number): Promise<Uint8Array>;
  write(offset: number, data: Uint8Array): Promise<void>;
}

export function memoryAccess(buf: Uint8Array): RandomAccess {
  return {
    size: buf.length,
    async read(offset, length) {
      return buf.slice(offset, Math.min(buf.length, offset + length));
    },
    async write(offset, data) {
      buf.set(data, offset);
    },
  };
}
