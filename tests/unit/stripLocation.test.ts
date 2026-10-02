/// <reference types="jest" />
import { memoryAccess } from '@/lib/media/randomAccess';
import { emptyGpsIfd, readCaptureDate, stripLocation } from '@/lib/media/stripLocation';

// ── tiny binary builders ───────────────────────────────────────────────────
const be16 = (n: number) => [(n >> 8) & 255, n & 255];
const be32 = (n: number) => [(n >>> 24) & 255, (n >> 16) & 255, (n >> 8) & 255, n & 255];
const str = (s: string) => Array.from(s).map((c) => c.charCodeAt(0));

/** Big-endian TIFF: IFD0 {Make, GPSInfo→GPS IFD}, GPS IFD {LatRef, Lat(3 rationals), LonRef, Lon}. */
function tiffWithGps(): number[] {
  const t: number[] = [];
  t.push(...str('MM'), ...be16(42), ...be32(8));
  // IFD0 @8: 2 entries
  t.push(...be16(2));
  t.push(...be16(0x010f), ...be16(2), ...be32(4), ...str('RoLo')); // Make "RoLo" inline
  t.push(...be16(0x8825), ...be16(4), ...be32(1), ...be32(38)); // GPS IFD @38
  t.push(...be32(0)); // next IFD
  // GPS IFD @38: 4 entries (2 + 4*12 + 4 = 54 bytes) → data @92
  t.push(...be16(4));
  t.push(...be16(1), ...be16(2), ...be32(2), ...str('S\0\0\0')); // LatRef 'S'
  t.push(...be16(2), ...be16(5), ...be32(3), ...be32(92)); // Lat → 24 bytes @92
  t.push(...be16(3), ...be16(2), ...be32(2), ...str('W\0\0\0')); // LonRef 'W'
  t.push(...be16(4), ...be16(5), ...be32(3), ...be32(116)); // Lon → 24 bytes @116
  t.push(...be32(0));
  // @92 lat 22/1 45/1 3000/100 ; @116 lon 41/1 52/1 1200/100
  for (const [a, b] of [[22, 1], [45, 1], [3000, 100], [41, 1], [52, 1], [1200, 100]]) t.push(...be32(a), ...be32(b));
  return t;
}

function jpegWithGps(): Uint8Array {
  const tiff = tiffWithGps();
  const app1 = [...str('Exif\0\0'), ...tiff];
  const xmp = str('http://ns.adobe.com/xap/1.0/\0<x:xmpmeta><rdf:Description exif:GPSLatitude="22,45.5S" exif:GPSLongitude="41,52.2W" tiff:Make="RoLo"/></x:xmpmeta>');
  const bytes = [0xff, 0xd8, 0xff, 0xe1, ...be16(app1.length + 2), ...app1, 0xff, 0xe1, ...be16(xmp.length + 2), ...xmp, 0xff, 0xda, 0, 4, 1, 2, 0xab, 0xcd, 0xff, 0xd9];
  return new Uint8Array(bytes);
}

function heicWithGps(): Uint8Array {
  const box = (type: string, body: number[]) => [...be32(body.length + 8), ...str(type), ...body];
  const full = (type: string, v: number, body: number[]) => box(type, [v, 0, 0, 0, ...body]);
  const tiff = tiffWithGps();
  const exifPayload = [...be32(6), ...str('Exif\0\0'), ...tiff];
  const ftyp = box('ftyp', [...str('heic'), 0, 0, 0, 0, ...str('mif1heic')]);
  const infeExif = full('infe', 2, [...be16(2), ...be16(0), ...str('Exif'), 0]);
  const infeImg = full('infe', 2, [...be16(1), ...be16(0), ...str('hvc1'), 0]);
  const iinf = full('iinf', 0, [...be16(2), ...infeImg, ...infeExif]);
  // iloc v0: offset_size=4,len_size=4, base_offset_size=0
  const ilocBody = (exifOffset: number) => [0x44, 0x00, ...be16(2), ...be16(1), ...be16(0), ...be16(1), ...be32(0), ...be32(4), ...be16(2), ...be16(0), ...be16(1), ...be32(exifOffset), ...be32(exifPayload.length)];
  const metaLen = (o: number) => full('meta', 0, [...full('hdlr', 0, [0, 0, 0, 0, ...str('pict'), ...new Array(13).fill(0)]), ...iinf, ...full('iloc', 0, ilocBody(o))]).length;
  const mdatStart = ftyp.length + metaLen(0);
  const exifOffset = mdatStart + 8 + 4; // 4 bytes of fake image data first
  const meta = full('meta', 0, [...full('hdlr', 0, [0, 0, 0, 0, ...str('pict'), ...new Array(13).fill(0)]), ...iinf, ...full('iloc', 0, ilocBody(exifOffset))]);
  const mdat = box('mdat', [0xde, 0xad, 0xbe, 0xef, ...exifPayload]);
  return new Uint8Array([...ftyp, ...meta, ...mdat]);
}

function movWithGps(): Uint8Array {
  const box = (type: string, body: number[]) => [...be32(body.length + 8), ...Array.from(type).map((c) => c.charCodeAt(0) & 255), ...body];
  const xyz = '+22.7469-041.8814+003.000/';
  const ftyp = box('ftyp', [...str('qt  '), 0, 0, 0, 0, ...str('qt  ')]);
  const mdat = box('mdat', [1, 2, 3, 4, 5, 6, 7, 8]);
  // 3GPP 'loci': version/flags, language, name, role, lon/lat/alt as 16.16 fixed point, body, notes
  const loci = box('loci', [0, 0, 0, 0, ...be16(0x15c7), 0, 0, ...be32(0xffd61000), ...be32(0xffe94000), ...be32(0), ...str('earth'), 0, 0]);
  const udta = box('udta', [...box('©xyz', [...be16(xyz.length), ...be16(0x15c7), ...str(xyz)]), ...loci]);
  const keys = box('keys', [0, 0, 0, 0, ...be32(1), ...box('mdta', str('com.apple.quicktime.location.ISO6709'))]);
  const ilst = box('ilst', box('\0\0\0\u0001', box('data', [0, 0, 0, 1, 0, 0, 0, 0, ...str(xyz)])));
  const meta = box('meta', [...box('hdlr', [0, 0, 0, 0, 0, 0, 0, 0, ...str('mdta'), ...new Array(12).fill(0)]), ...keys, ...ilst]);
  const moov = box('moov', [...box('mvhd', new Array(20).fill(0)), ...udta, ...meta]);
  return new Uint8Array([...ftyp, ...mdat, ...moov]);
}

const text = (b: Uint8Array) => String.fromCharCode(...b);

describe('emptyGpsIfd', () => {
  it('empties the GPS IFD and zeroes the coordinates, leaving IFD0 intact', () => {
    const tiff = new Uint8Array(tiffWithGps());
    expect(emptyGpsIfd(tiff)).toBe(true);
    expect((tiff[38] << 8) | tiff[39]).toBe(0); // GPS entry count = 0
    expect(tiff.subarray(92, 140).every((b) => b === 0)).toBe(true); // rationals gone
    expect(text(tiff.subarray(18, 22))).toBe('RoLo'); // Make untouched
  });
  it('returns false when there is no GPS', () => {
    const t = new Uint8Array([...str('MM'), 0, 42, 0, 0, 0, 8, 0, 0, 0, 0, 0, 0]);
    expect(emptyGpsIfd(t)).toBe(false);
  });
});

describe('stripLocation', () => {
  it('JPEG: removes Exif GPS and XMP GPS, keeps size and image data', async () => {
    const buf = jpegWithGps();
    const before = buf.slice();
    const r = await stripLocation(memoryAccess(buf));
    expect(r.format).toBe('jpeg');
    expect(r.removed).toEqual(['exif-gps', 'xmp-gps']);
    expect(buf.length).toBe(before.length);
    expect(text(buf)).not.toMatch(/22,45\.5S|41,52\.2W/);
    expect(text(buf)).toContain('tiff:Make="RoLo"');
    expect(Array.from(buf.slice(-8))).toEqual(Array.from(before.slice(-8))); // scan data untouched
  });

  it('HEIC: finds the Exif item through iinf/iloc and empties GPS', async () => {
    const buf = heicWithGps();
    const len = buf.length;
    const r = await stripLocation(memoryAccess(buf));
    expect(r).toEqual({ format: 'heic', removed: ['exif-gps'] });
    expect(buf.length).toBe(len);
    const t = text(buf);
    expect(t).toContain('Þ­¾ï'); // image bytes untouched
    // rationals 22/1 must be gone
    expect(t.includes(String.fromCharCode(0, 0, 0, 22, 0, 0, 0, 1))).toBe(false);
  });

  it('MOV: retypes ©xyz to free and blanks ISO 6709 values', async () => {
    const buf = movWithGps();
    const len = buf.length;
    const r = await stripLocation(memoryAccess(buf));
    expect(r.format).toBe('video');
    expect(r.removed).toEqual(expect.arrayContaining(['qt-xyz', '3gpp-loci', 'iso6709']));
    expect(text(buf)).not.toContain('loci');
    expect(buf.length).toBe(len);
    expect(text(buf)).not.toContain('+22.7469-041.8814');
    expect(text(buf)).toContain('free');
    expect(text(buf)).toContain('com.apple.quicktime.location.ISO6709'); // key name stays, value gone
  });

  it('files without location are left byte-identical', async () => {
    const buf = new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0, 4, 1, 2, 0xff, 0xd9, 0, 0]);
    const before = buf.slice();
    const r = await stripLocation(memoryAccess(buf));
    expect(r.removed).toEqual([]);
    expect(buf).toEqual(before);
  });
});

describe('readCaptureDate', () => {
  it('reads DateTimeOriginal with its UTC offset from a JPEG', async () => {

    // TIFF (II): IFD0 { ExifIFD → @26 }, ExifIFD { DateTimeOriginal @56, OffsetTimeOriginal @76 }
    const le16 = (n: number) => [n & 255, n >> 8];
    const le32 = (n: number) => [n & 255, (n >> 8) & 255, (n >> 16) & 255, n >>> 24];
    const t = [...str('II'), ...le16(42), ...le32(8), ...le16(1), ...le16(0x8769), ...le16(4), ...le32(1), ...le32(26), ...le32(0)];
    t.push(...le16(2), ...le16(0x9003), ...le16(2), ...le32(20), ...le32(56), ...le16(0x9011), ...le16(2), ...le32(7), ...le32(76), ...le32(0));
    while (t.length < 56) t.push(0);
    t.push(...str('2026:01:12 17:45:03\0'), ...str('-03:00\0'));
    const app1 = [...str('Exif\0\0'), ...t];
    const jpg = new Uint8Array([0xff, 0xd8, 0xff, 0xe1, ...be16(app1.length + 2), ...app1, 0xff, 0xda, 0, 2, 0xff, 0xd9]);
    expect(await readCaptureDate(memoryAccess(jpg))).toBe('2026-01-12T20:45:03.000Z');
  });
});
