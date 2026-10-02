import { AssetField, getPermissionsAsync, Query, type Asset } from 'expo-media-library';

/** Number of library photos/videos captured in [start, end], or null if we may not look. */
export async function countAssetsInRange(start: Date, end: Date): Promise<number | null> {
  const p = await getPermissionsAsync();
  if (!p.granted) return null;
  const assets = await new Query().gte(AssetField.CREATION_TIME, +start).lte(AssetField.CREATION_TIME, +end).exeForMetadata();
  return assets.length;
}

export async function assetsInRange(start: Date, end: Date): Promise<Asset[]> {
  return new Query().gte(AssetField.CREATION_TIME, +start).lte(AssetField.CREATION_TIME, +end).orderBy({ key: AssetField.CREATION_TIME, ascending: false }).exe();
}
