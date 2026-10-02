import { QueryClient } from '@tanstack/react-query';

import { errorCode } from './errors';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 1000 * 60 * 30,
      retry: (count, err) => {
        const code = errorCode(err);
        if (code !== 'offline' && code !== 'generic') return false; // access errors are final
        return count < 3;
      },
      refetchOnWindowFocus: true,
    },
  },
});

export const qk = {
  albums: ['albums'] as const,
  album: (id: string) => ['album', id] as const,
  members: (id: string) => ['members', id] as const,
  media: (id: string) => ['media', id] as const,
  preview: (token: string) => ['preview', token] as const,
  usage: ['usage'] as const,
  albumStorage: (id: string) => ['albumStorage', id] as const,
  profile: ['profile'] as const,
};
