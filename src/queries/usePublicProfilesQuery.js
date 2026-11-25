import { useQuery } from '@tanstack/vue-query';
import { api } from '@/lib/http.js';
import { QUERY_KEYS, resolveComponentQueryClient } from '@/lib/query-client.js';

export async function fetchPublicProfilesWithQuery(queryClient) {
  return await queryClient.fetchQuery({
    queryKey: QUERY_KEYS.publicProfiles,
    staleTime: 0,
    queryFn: () => api.get('/api/public/profiles'),
  });
}

export function usePublicProfilesQuery(options = {}) {
  const queryClient = options.queryClient || resolveComponentQueryClient();
  return useQuery(
    {
      queryKey: QUERY_KEYS.publicProfiles,
      queryFn: () => api.get('/api/public/profiles'),
      ...options,
    },
    queryClient,
  );
}
