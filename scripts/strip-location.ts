// CLI: strip GPS from files in place using the app's own implementation.
//   npx tsx scripts/strip-location.ts photo.heic video.mov
import { openSync, readSync, writeSync, fstatSync, closeSync } from 'node:fs';

import type { RandomAccess } from '../src/lib/media/randomAccess';
import { stripLocation } from '../src/lib/media/stripLocation';

function fileAccess(path: string): RandomAccess & { close(): void } {
  const fd = openSync(path, 'r+');
  return {
    size: fstatSync(fd).size,
    async read(offset, length) {
      const buf = Buffer.alloc(length);
      const n = readSync(fd, buf, 0, length, offset);
      return new Uint8Array(buf.buffer, buf.byteOffset, n);
    },
    async write(offset, data) {
      writeSync(fd, data, 0, data.length, offset);
    },
    close: () => closeSync(fd),
  };
}

(async () => {
  for (const path of process.argv.slice(2)) {
    const io = fileAccess(path);
    const r = await stripLocation(io);
    io.close();
    console.log(path, JSON.stringify(r));
  }
})();
