import * as ImagePicker from 'expo-image-picker';
import { Asset, AssetField, MediaType, Query, getPermissionsAsync, presentPermissionsPicker, requestPermissionsAsync, type AssetMetadata } from 'expo-media-library';
import { Platform } from 'react-native';

import type { MediaKind } from '@/lib/types';

/** A photo/video the user may add, from the library or a picker. */
export type Candidate = {
  key: string;
  assetId?: string | null;
  uri: string;
  filename: string;
  kind: MediaKind;
  mimeType?: string | null;
  width?: number | null;
  height?: number | null;
  durationMs?: number | null;
  capturedAt?: string | null;
  /** Exact size if known (picker), else estimated. */
  size?: number | null;
  livePhotoUri?: string | null;
};

export type LibraryAccess = 'undetermined' | 'denied' | 'limited' | 'all';

export async function getLibraryAccess(): Promise<LibraryAccess> {
  const p = await getPermissionsAsync();
  if (p.granted) return p.accessPrivileges === 'limited' ? 'limited' : 'all';
  return p.canAskAgain ? 'undetermined' : 'denied';
}

export async function requestLibraryAccess(): Promise<LibraryAccess> {
  const p = await requestPermissionsAsync();
  if (p.granted) return p.accessPrivileges === 'limited' ? 'limited' : 'all';
  return p.canAskAgain ? 'undetermined' : 'denied';
}

export const manageLimitedAccess = () => presentPermissionsPicker().catch(() => {});

async function toCandidate(m: AssetMetadata): Promise<Candidate> {
  // iOS: expo-image renders ph:// asset ids directly; Android needs the content:// uri.
  const uri = Platform.OS === 'ios' ? `ph://${m.id}` : await new Asset(m.id).getUri();
  return {
    key: m.id,
    assetId: m.id,
    uri,
    filename: m.filename ?? `${m.id}.${m.mediaType === MediaType.VIDEO ? 'mov' : 'heic'}`,
    kind: m.mediaType === MediaType.VIDEO ? 'video' : 'photo',
    width: m.width,
    height: m.height,
    durationMs: m.duration ? Math.round(m.duration * 1000) : null,
    capturedAt: m.creationTime ? new Date(m.creationTime).toISOString() : null,
  };
}

export async function loadLibrary(opts: { start?: Date; end?: Date; limit?: number; offset?: number }): Promise<Candidate[]> {
  let q = new Query().within(AssetField.MEDIA_TYPE, [MediaType.IMAGE, MediaType.VIDEO]).orderBy({ key: AssetField.CREATION_TIME, ascending: false });
  if (opts.start) q = q.gte(AssetField.CREATION_TIME, +opts.start);
  if (opts.end) q = q.lte(AssetField.CREATION_TIME, +opts.end);
  if (opts.limit) q = q.limit(opts.limit);
  if (opts.offset) q = q.offset(opts.offset);
  const meta = await q.exeForMetadata();
  return Promise.all(meta.map(toCandidate));
}

/** System picker: works without full library access. Asks for originals (no transcoding). */
export async function pickWithSystemPicker(): Promise<Candidate[]> {
  const r = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images', 'videos', 'livePhotos'],
    allowsMultipleSelection: true,
    selectionLimit: 0,
    quality: 1,
    exif: false,
    preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Current,
    videoExportPreset: ImagePicker.VideoExportPreset.Passthrough,
    orderedSelection: true,
  });
  if (r.canceled) return [];
  return r.assets.map((a, i) => ({
    key: a.assetId ?? `${a.uri}-${i}`,
    assetId: a.assetId ?? null,
    uri: a.uri,
    filename: a.fileName ?? a.uri.split('/').pop() ?? `photo-${i}.jpg`,
    kind: a.type === 'video' ? 'video' : 'photo',
    mimeType: a.mimeType ?? null,
    width: a.width,
    height: a.height,
    durationMs: a.duration ?? null,
    size: a.fileSize ?? null,
    capturedAt: null,
    // Live Photo picked via the picker: carry the paired video along.
    ...(a.pairedVideoAsset ? { livePhotoUri: a.pairedVideoAsset.uri } : {}),
  }));
}
