import type { RandomAccess } from './randomAccess';

/**
 * Removes GPS location from photo/video originals IN PLACE, without re-encoding and without
 * changing the file length or any other byte offsets. The image/video data stays bit-identical.
 *
 *   JPEG  APP1/Exif → GPS IFD emptied (entry count 0, values zeroed); APP1/XMP exif:GPS* blanked
 *   HEIC  'Exif' item located via meta/iinf + meta/iloc → same TIFF treatment
 *   MOV/MP4  moov/udta ©xyz and 3GPP loci atoms retyped to 'free'; ISO 6709 strings (mdta keys) blanked
 *
 * Returns which kinds of location data were found and removed.
 */
export type StripResult = { format: 'jpeg' | 'heic' | 'video' | 'unknown'; removed: string[] };

const ascii = (b: Uint8Array, o: number, n: number) => {
  // Chunked: spreading a multi-MB array into fromCharCode would overflow the stack.
  let s = '';
  const end = Math.min(b.length, o + n);
  for (let i = o; i < end; i += 8192) s += String.fromCharCode.apply(null, Array.from(b.subarray(i, Math.min(end, i + 8192))));
  return s;
};
const u16 = (b: Uint8Array, o: number, le: boolean) => (le ? b[o] | (b[o + 1] << 8) : (b[o] << 8) | b[o + 1]);
const u32 = (b: Uint8Array, o: number, le = false) =>
  le ? (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0 : ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;

const TYPE_SIZE: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8 };

/**
 * Empties the GPS IFD of a TIFF/Exif block held in `tiff` (offsets relative to its start).
 * Mutates `tiff`; returns true if a GPS IFD was found.
 */
export function emptyGpsIfd(tiff: Uint8Array): boolean {
  if (tiff.length < 8) return false;
  const order = ascii(tiff, 0, 2);
  if (order !== 'II' && order !== 'MM') return false;
  const le = order === 'II';
  if (u16(tiff, 2, le) !== 42) return false;
  const ifd0 = u32(tiff, 4, le);
  if (ifd0 + 2 > tiff.length) return false;
  const n = u16(tiff, ifd0, le);
  let gps = 0;
  for (let i = 0; i < n; i++) {
    const e = ifd0 + 2 + i * 12;
    if (e + 12 > tiff.length) break;
    if (u16(tiff, e, le) === 0x8825) gps = u32(tiff, e + 8, le);
  }
  if (!gps || gps + 2 > tiff.length) return false;

  const count = u16(tiff, gps, le);
  for (let i = 0; i < count; i++) {
    const e = gps + 2 + i * 12;
    if (e + 12 > tiff.length) break;
    const type = u16(tiff, e + 2, le);
    const cnt = u32(tiff, e + 4, le);
    const bytes = (TYPE_SIZE[type] ?? 1) * cnt;
    if (bytes > 4) {
      const off = u32(tiff, e + 8, le);
      if (off + bytes <= tiff.length) tiff.fill(0, off, off + bytes); // out-of-line values (lat/lon rationals…)
    }
  }
  // Zero all entries + next-IFD pointer, then set count = 0 → an empty, valid IFD.
  const end = Math.min(tiff.length, gps + 2 + count * 12 + 4);
  tiff.fill(0, gps, end);
  return true;
}

/** Blank exif:GPS* values in an XMP packet (keeps XML well-formed and same length). */
export function blankXmpGps(buf: Uint8Array): boolean {
  const text = ascii(buf, 0, buf.length);
  let changed = false;
  const blank = (start: number, end: number) => {
    buf.fill(0x20, start, end);
    changed = true;
  };
  // attribute form: exif:GPSLatitude="22,45.1N"
  for (const m of text.matchAll(/exif:GPS[A-Za-z]*="([^"]*)"/g)) {
    const valueStart = m.index! + m[0].indexOf('"') + 1;
    blank(valueStart, valueStart + m[1].length);
  }
  // element form: <exif:GPSLatitude>22,45.1N</exif:GPSLatitude>
  for (const m of text.matchAll(/<exif:(GPS[A-Za-z]*)>([^<]*)<\/exif:\1>/g)) {
    const valueStart = m.index! + m[0].indexOf('>') + 1;
    blank(valueStart, valueStart + m[2].length);
  }
  return changed;
}

async function stripJpeg(io: RandomAccess): Promise<string[]> {
  const removed: string[] = [];
  let pos = 2;
  while (pos + 4 <= io.size) {
    const h = await io.read(pos, 4);
    if (h[0] !== 0xff) break;
    const marker = h[1];
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      pos += 2;
      continue;
    }
    if (marker === 0xda || marker === 0xd9) break; // start of scan / end: no more metadata
    const len = (h[2] << 8) | h[3];
    if (marker === 0xe1) {
      const seg = await io.read(pos + 4, len - 2);
      if (ascii(seg, 0, 6) === 'Exif\0\0') {
        const tiff = seg.subarray(6);
        if (emptyGpsIfd(tiff)) {
          await io.write(pos + 4, seg);
          removed.push('exif-gps');
        }
      } else if (ascii(seg, 0, 28) === 'http://ns.adobe.com/xap/1.0/') {
        if (blankXmpGps(seg)) {
          await io.write(pos + 4, seg);
          removed.push('xmp-gps');
        }
      }
    }
    pos += 2 + len;
  }
  return removed;
}

type Box = { type: string; start: number; header: number; size: number };

async function readBoxes(io: RandomAccess, from: number, to: number): Promise<Box[]> {
  const out: Box[] = [];
  let pos = from;
  while (pos + 8 <= to) {
    const h = await io.read(pos, 16);
    let size = u32(h, 0);
    const type = ascii(h, 4, 4);
    let header = 8;
    if (size === 1) {
      size = u32(h, 8) * 2 ** 32 + u32(h, 12);
      header = 16;
    } else if (size === 0) size = to - pos;
    if (size < header) break;
    out.push({ type, start: pos, header, size });
    pos += size;
  }
  return out;
}

function boxesIn(buf: Uint8Array, from: number, to: number): Box[] {
  const out: Box[] = [];
  let pos = from;
  while (pos + 8 <= to) {
    let size = u32(buf, pos);
    const type = ascii(buf, pos + 4, 4);
    let header = 8;
    if (size === 1) {
      size = u32(buf, pos + 8) * 2 ** 32 + u32(buf, pos + 12);
      header = 16;
    } else if (size === 0) size = to - pos;
    if (size < header || pos + size > to) break;
    out.push({ type, start: pos, header, size });
    pos += size;
  }
  return out;
}

const readN = (b: Uint8Array, o: number, n: number) => (n === 0 ? 0 : n === 2 ? u16(b, o, false) : n === 4 ? u32(b, o) : u32(b, o) * 2 ** 32 + u32(b, o + 4));

/** Locates the Exif item of a HEIF/HEIC file: absolute offset, payload bytes and TIFF start within it. */
export async function locateHeifExif(io: RandomAccess, top?: Box[]): Promise<{ abs: number; payload: Uint8Array; tiffStart: number } | null> {
  top = top ?? (await readBoxes(io, 0, io.size));
  const meta = top.find((b) => b.type === 'meta');
  if (!meta || meta.size > 16 * 1024 * 1024) return null;
  const m = await io.read(meta.start, meta.size);
  const children = boxesIn(m, meta.header + 4, m.length); // meta is a FullBox

  // iinf → item id of type 'Exif'
  const iinf = children.find((b) => b.type === 'iinf');
  const iloc = children.find((b) => b.type === 'iloc');
  if (!iinf || !iloc) return null;
  const iinfV = m[iinf.start + iinf.header];
  const entriesAt = iinf.start + iinf.header + 4 + (iinfV === 0 ? 2 : 4);
  let exifId = -1;
  for (const infe of boxesIn(m, entriesAt, iinf.start + iinf.size)) {
    if (infe.type !== 'infe') continue;
    const v = m[infe.start + infe.header];
    if (v < 2) continue;
    const p = infe.start + infe.header + 4;
    const id = v === 2 ? u16(m, p, false) : u32(m, p);
    const typeAt = p + (v === 2 ? 2 : 4) + 2;
    if (ascii(m, typeAt, 4) === 'Exif') exifId = id;
  }
  if (exifId < 0) return null;

  // iloc → absolute offset/length of that item
  let p = iloc.start + iloc.header;
  const v = m[p];
  p += 4;
  const offSize = m[p] >> 4;
  const lenSize = m[p] & 15;
  const baseSize = m[p + 1] >> 4;
  const idxSize = v === 1 || v === 2 ? m[p + 1] & 15 : 0;
  p += 2;
  const count = v < 2 ? u16(m, p, false) : u32(m, p);
  p += v < 2 ? 2 : 4;
  for (let i = 0; i < count; i++) {
    const id = v < 2 ? u16(m, p, false) : u32(m, p);
    p += v < 2 ? 2 : 4;
    let method = 0;
    if (v === 1 || v === 2) {
      method = u16(m, p, false) & 15;
      p += 2;
    }
    p += 2; // data_reference_index
    const base = readN(m, p, baseSize);
    p += baseSize;
    const extents = u16(m, p, false);
    p += 2;
    let firstOff = 0;
    let firstLen = 0;
    for (let e = 0; e < extents; e++) {
      p += idxSize;
      const off = readN(m, p, offSize);
      p += offSize;
      const len = readN(m, p, lenSize);
      p += lenSize;
      if (e === 0) {
        firstOff = off;
        firstLen = len;
      }
    }
    if (id !== exifId) continue;
    if (method !== 0 || !firstLen) return null;
    const abs = base + firstOff;
    const payload = await io.read(abs, Math.min(firstLen, 4 * 1024 * 1024));
    const tiffAt = 4 + u32(payload, 0);
    // Some writers include the "Exif\0\0" marker before the TIFF header.
    const tiffStart = ascii(payload, tiffAt, 6) === 'Exif\0\0' ? tiffAt + 6 : tiffAt;
    return { abs, payload, tiffStart };
  }
  return null;
}

async function stripHeif(io: RandomAccess, top: Box[]): Promise<string[]> {
  const found = await locateHeifExif(io, top);
  if (!found) return [];
  if (emptyGpsIfd(found.payload.subarray(found.tiffStart))) {
    await io.write(found.abs, found.payload);
    return ['exif-gps'];
  }
  return [];
}

/** Locates the Exif TIFF block of a JPEG (first APP1 'Exif'). */
export async function locateJpegExif(io: RandomAccess): Promise<Uint8Array | null> {
  let pos = 2;
  while (pos + 4 <= io.size) {
    const h = await io.read(pos, 4);
    if (h[0] !== 0xff) return null;
    const marker = h[1];
    if (marker === 0xda || marker === 0xd9) return null;
    const len = (h[2] << 8) | h[3];
    if (marker === 0xe1) {
      const seg = await io.read(pos + 4, len - 2);
      if (ascii(seg, 0, 6) === 'Exif\0\0') return seg.subarray(6);
    }
    pos += 2 + len;
  }
  return null;
}

/** Reads DateTimeOriginal (+ OffsetTimeOriginal) from a TIFF block. Returns ISO string or null. */
export function tiffCaptureDate(tiff: Uint8Array): string | null {
  if (tiff.length < 8) return null;
  const order = ascii(tiff, 0, 2);
  if (order !== 'II' && order !== 'MM') return null;
  const le = order === 'II';
  const entries = (ifd: number) => {
    const out = new Map<number, { type: number; count: number; at: number }>();
    if (ifd + 2 > tiff.length) return out;
    const n = u16(tiff, ifd, le);
    for (let i = 0; i < n; i++) {
      const e = ifd + 2 + i * 12;
      if (e + 12 > tiff.length) break;
      const type = u16(tiff, e + 2, le);
      const count = u32(tiff, e + 4, le);
      const size = (TYPE_SIZE[type] ?? 1) * count;
      out.set(u16(tiff, e, le), { type, count, at: size > 4 ? u32(tiff, e + 8, le) : e + 8 });
    }
    return out;
  };
  const ifd0 = entries(u32(tiff, 4, le));
  const exifPtr = ifd0.get(0x8769);
  const exif = exifPtr ? entries(u32(tiff, exifPtr.at, le)) : new Map();
  const str = (e?: { count: number; at: number }) => (e ? ascii(tiff, e.at, e.count).replace(/\0+$/, '') : null);
  const dt = str(exif.get(0x9003)) ?? str(exif.get(0x9004)) ?? str(ifd0.get(0x0132));
  if (!dt) return null;
  const m = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/.exec(dt);
  if (!m) return null;
  const offset = str(exif.get(0x9011)); // "-03:00"
  const local = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}`;
  const d = new Date(offset && /^[+-]\d{2}:\d{2}$/.test(offset) ? `${local}${offset}` : local);
  return Number.isNaN(+d) ? null : d.toISOString();
}

/** Capture date of a JPEG/HEIC original from its EXIF, or null. */
export async function readCaptureDate(io: RandomAccess): Promise<string | null> {
  if (io.size < 12) return null;
  const head = await io.read(0, 12);
  if (head[0] === 0xff && head[1] === 0xd8) {
    const tiff = await locateJpegExif(io);
    return tiff ? tiffCaptureDate(tiff) : null;
  }
  if (ascii(head, 4, 4) === 'ftyp') {
    const found = await locateHeifExif(io);
    return found ? tiffCaptureDate(found.payload.subarray(found.tiffStart)) : null;
  }
  return null;
}

const ISO6709 = /[+-]\d{2}(?:\.\d+)?[+-]\d{3}(?:\.\d+)?(?:[+-]\d+(?:\.\d+)?)?(?:CRS[A-Za-z0-9:]+)?\//g;

async function stripVideo(io: RandomAccess, top: Box[]): Promise<string[]> {
  const moov = top.find((b) => b.type === 'moov');
  if (!moov || moov.size > 64 * 1024 * 1024) return [];
  const buf = await io.read(moov.start, moov.size);
  const removed: string[] = [];
  let changed = false;

  // Location atoms → 'free' (QuickTime/MP4 readers skip 'free' boxes anywhere):
  //   ©xyz = QuickTime/Apple ISO 6709 string, loci = 3GPP binary lat/long/alt.
  const LOCATION_ATOMS: [number[], string][] = [
    [[0xa9, 0x78, 0x79, 0x7a], 'qt-xyz'],
    [[0x6c, 0x6f, 0x63, 0x69], '3gpp-loci'],
  ];
  for (let i = 4; i + 4 <= buf.length; i++) {
    for (const [cc, label] of LOCATION_ATOMS) {
      if (buf[i] !== cc[0] || buf[i + 1] !== cc[1] || buf[i + 2] !== cc[2] || buf[i + 3] !== cc[3]) continue;
      const size = u32(buf, i - 4);
      if (size >= 8 && i - 4 + size <= buf.length) {
        buf.set([0x66, 0x72, 0x65, 0x65], i); // 'free'
        buf.fill(0, i + 4, i - 4 + size);
        if (!removed.includes(label)) removed.push(label);
        changed = true;
      }
    }
  }
  // mdta 'com.apple.quicktime.location.ISO6709' values and any remaining ISO 6709 strings.
  const text = ascii(buf, 0, buf.length);
  for (const m of text.matchAll(ISO6709)) {
    buf.fill(0x20, m.index!, m.index! + m[0].length);
    changed = true;
    if (!removed.includes('iso6709')) removed.push('iso6709');
  }
  if (changed) await io.write(moov.start, buf);
  return removed;
}

export async function stripLocation(io: RandomAccess): Promise<StripResult> {
  if (io.size < 12) return { format: 'unknown', removed: [] };
  const head = await io.read(0, 12);
  if (head[0] === 0xff && head[1] === 0xd8) return { format: 'jpeg', removed: await stripJpeg(io) };
  if (ascii(head, 4, 4) === 'ftyp') {
    const brand = ascii(head, 8, 4);
    const top = await readBoxes(io, 0, io.size);
    if (['heic', 'heix', 'mif1', 'msf1', 'heim', 'heis', 'avif', 'hevc'].includes(brand) || top.some((b) => b.type === 'meta')) {
      if (!top.some((b) => b.type === 'moov')) return { format: 'heic', removed: await stripHeif(io, top) };
    }
    return { format: 'video', removed: await stripVideo(io, top) };
  }
  // QuickTime files may start with 'wide'/'mdat'/'moov' instead of 'ftyp'.
  if (['moov', 'mdat', 'wide', 'free'].includes(ascii(head, 4, 4))) {
    const top = await readBoxes(io, 0, io.size);
    return { format: 'video', removed: await stripVideo(io, top) };
  }
  return { format: 'unknown', removed: [] };
}
