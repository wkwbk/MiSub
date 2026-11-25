import type { MisubItem } from '@misub/core/types.js';
import type { Env } from '../../types.js';
import { createExternalError, createExternalSuccess, getExternalStorageAdapter } from './external-api-utils.js';
import { detectNodeProtocol, isManualNode, isRemoteSubscription, toExternalProfile } from './external-api-mappers.js';

export async function handleExternalPreviewRequest(
  _request: Request,
  env: Env,
  profileId: string,
): Promise<Response> {
  const storageAdapter = await getExternalStorageAdapter(env);
  const profile = await storageAdapter.getProfileById(profileId);
  if (!profile) return createExternalError('profile_not_found', 'Profile not found', 404);

  const allSubscriptions = await storageAdapter.getAllSubscriptions();
  const byId = new Map<string, MisubItem>(allSubscriptions.map((item) => [item.id, item]));
  const subscriptionIds = Array.isArray(profile.subscriptions) ? profile.subscriptions : [];
  const manualNodeIds = Array.isArray(profile.manualNodes) ? profile.manualNodes : [];

  const remoteSources = subscriptionIds
    .map((ref) => (typeof ref === 'string' ? byId.get(ref) : undefined))
    .filter((item): item is MisubItem => Boolean(item) && isRemoteSubscription(item))
    .map((item) => ({
      id: item.id,
      type: 'subscription' as const,
      name: item.name || '',
      url: item.url || '',
    }));

  const manualSources = manualNodeIds
    .map((id) => byId.get(id))
    .filter((item): item is MisubItem => Boolean(item) && isManualNode(item))
    .map((item) => ({
      id: item.id,
      type: 'manual_node' as const,
      name: item.name || '',
      protocol: detectNodeProtocol(item.url),
      nodeCount: 1,
      url: item.url || '',
    }));

  const byProtocol: Record<string, number> = {};
  manualSources.forEach((item) => {
    byProtocol[item.protocol] = (byProtocol[item.protocol] || 0) + 1;
  });

  return createExternalSuccess({
    profile: toExternalProfile(profile),
    counts: {
      subscriptions: remoteSources.length,
      manualNodes: manualSources.length,
      totalNodes: manualSources.length,
    },
    byProtocol,
    sources: [...remoteSources, ...manualSources],
  });
}
