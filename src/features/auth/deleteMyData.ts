import { queryClient } from '@/lib/queryClient';
import { storageProvider } from '@/lib/storage';
import { supabase } from '@/lib/supabase';
import { useUploads } from '@/features/upload/store';
import { mediaOps } from '@/features/upload/mediaOps';
import { retryAuth } from './session';

/**
 * LGPD/GDPR erasure: removes the bytes (own uploads everywhere + everything in albums I own),
 * then the account (cascades rows), then local caches and queued uploads; finally starts a fresh
 * anonymous session so the app keeps working.
 */
export async function deleteMyData() {
  const { data: paths, error } = await supabase.rpc('my_data_storage_paths');
  if (error) throw new Error(error.message);
  await storageProvider.remove(((paths as string[]) ?? []).filter(Boolean));
  const del = await supabase.rpc('delete_my_data');
  if (del.error) throw new Error(del.error.message);

  for (const item of useUploads.getState().items) mediaOps.cleanup(item.id);
  useUploads.setState({ items: [] });
  queryClient.clear();
  await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
  await retryAuth();
}
