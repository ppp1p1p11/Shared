import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { qk } from '@/lib/queryClient';
import { supabase } from '@/lib/supabase';
import { useAuth } from './session';

export type Profile = { id: string; display_name: string; avatar_color: number; is_anonymous: boolean; plan: 'free' | 'plus' };

export function useProfile() {
  const userId = useAuth((s) => s.userId);
  return useQuery({
    queryKey: [...qk.profile, userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('id,display_name,avatar_color,is_anonymous,plan').eq('id', userId!).single();
      if (error) throw new Error(error.message);
      return data as Profile;
    },
  });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { displayName?: string; avatarColor?: number }) => {
      const { error } = await supabase.rpc('update_profile', { p_display_name: v.displayName ?? null, p_avatar_color: v.avatarColor ?? null });
      if (error) throw new Error(error.message);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: qk.profile });
      qc.invalidateQueries({ queryKey: qk.albums });
    },
  });
}
