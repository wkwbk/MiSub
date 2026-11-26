import type { MaybeRefOrGetter } from 'vue';
import { useQuery, type QueryClient } from '@tanstack/vue-query';
import { api } from '@/lib/http.js';
import { API_ENDPOINTS } from '@/constants/api-endpoints.js';
import { QUERY_KEYS, resolveComponentQueryClient } from '@/lib/query-client.js';

interface PublicProfileSummary {
  id: string;
  name: string;
  description: string;
  tags: string[];
  customId?: string;
  linkId: string;
  shareId: string;
  shortLink: string;
  updatedAt?: string | null;
  subscriptionCount: number;
  manualNodeCount: number;
  [key: string]: unknown;
}

interface PublicProfilesResponse {
  success: boolean;
  data?: PublicProfileSummary[];
  config?: {
    profileToken?: string;
    announcement?: Record<string, unknown>;
    hero?: Record<string, unknown>;
    guestbook?: Record<string, unknown>;
    customPage?: Record<string, unknown>;
    defaultLocale?: string;
    [key: string]: unknown;
  };
  error?: string;
  message?: string;
  [key: string]: unknown;
}

export interface UsePublicProfilesQueryOptions {
  enabled?: MaybeRefOrGetter<boolean>;
  staleTime?: number;
  gcTime?: number;
  retry?: boolean | number;
  refetchOnWindowFocus?: boolean;
  queryClient?: QueryClient;
}

export function usePublicProfilesQuery(options: UsePublicProfilesQueryOptions = {}) {
  const queryClient = options.queryClient || resolveComponentQueryClient();
  return useQuery(
    {
      queryKey: QUERY_KEYS.publicProfiles,
      queryFn: () => api.get(API_ENDPOINTS.PUBLIC_PROFILES) as Promise<PublicProfilesResponse>,
      ...options,
    },
    queryClient,
  );
}
