import { useQuery, type QueryClient, type UseQueryOptions } from '@tanstack/vue-query';
import { api } from '@/lib/http.js';
import { API_ENDPOINTS } from '@/constants/api-endpoints.js';
import { QUERY_KEYS, resolveComponentQueryClient } from '@/lib/query-client.js';

export interface PublicProfileSummary {
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

export interface PublicProfilesResponse {
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

export interface UsePublicProfilesQueryOptions
  extends Omit<
    UseQueryOptions<PublicProfilesResponse, Error, PublicProfilesResponse, typeof QUERY_KEYS.publicProfiles>,
    'queryKey' | 'queryFn'
  > {
  queryClient?: QueryClient;
}

export async function fetchPublicProfilesWithQuery(queryClient: QueryClient): Promise<PublicProfilesResponse> {
  return await queryClient.fetchQuery({
    queryKey: QUERY_KEYS.publicProfiles,
    staleTime: 0,
    queryFn: () => api.get(API_ENDPOINTS.PUBLIC_PROFILES) as Promise<PublicProfilesResponse>,
  });
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
