import { describe, expect, it } from 'vitest';
import {
  buildExternalNodesCacheKey,
  buildExternalNodesCallbackUrl,
  createExternalNodesToken,
  getExternalNodes,
  handleExternalNodesCallbackRequest,
  putExternalNodes,
  shouldUseExternalNodesCallback,
  verifyExternalNodesToken,
} from '../../functions/services/external-nodes-callback-service.js';
import { createMemoryD1 } from '../helpers/memory-d1.js';

function clearExternalNodesMemoryCache() {
  delete globalThis.__misubExternalNodesCallbackCache;
}

describe('external nodes callback service', () => {
  it('uses callback only when inline URL or node count exceeds thresholds', () => {
    expect(shouldUseExternalNodesCallback({ inlineUrlLength: 6000, nodeCount: 80 })).toBe(false);
    expect(shouldUseExternalNodesCallback({ inlineUrlLength: 6001, nodeCount: 80 })).toBe(true);
    expect(shouldUseExternalNodesCallback({ inlineUrlLength: 6000, nodeCount: 81 })).toBe(true);
    expect(shouldUseExternalNodesCallback({ inlineUrlLength: 10, nodeCount: 1 })).toBe(false);
  });

  it('stores external nodes in D1 under a profile and content hash with ttl', async () => {
    const db = createMemoryD1();
    const env = { MISUB_DB: db };
    const nodesText = 'ss://node-a#A\nss://node-b#B\n';

    const result = await putExternalNodes({ env, profileId: 'profile-a', nodesText });

    expect(result.nodeHash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.cacheKey).toBe(buildExternalNodesCacheKey('profile-a', result.nodeHash));
    expect(result.storage).toBe('d1');
    expect(db.tables.cache.has(result.cacheKey)).toBe(true);
    expect(db.tables.settings.has(result.cacheKey)).toBe(false);
  });

  it('reuses existing unexpired D1 entry instead of writing again', async () => {
    const db = createMemoryD1();
    const env = { MISUB_DB: db };
    const nodesText = 'ss://cached#A\n';

    const first = await putExternalNodes({ env, profileId: 'profile-a', nodesText });
    const second = await putExternalNodes({ env, profileId: 'profile-a', nodesText });

    expect(first.reused).toBe(false);
    expect(second.reused).toBe(true);
    expect(second.storage).toBe('d1');
  });

  it('signs, verifies, and rejects tampered or expired callback tokens', async () => {
    const secret = 'unit-test-secret';
    const token = await createExternalNodesToken({
      profileId: 'profile-a',
      nodeHash: 'a'.repeat(64),
      secret,
      expiresInSeconds: 120,
    });
    const verified = await verifyExternalNodesToken(token, secret);

    expect(verified.profileId).toBe('profile-a');
    expect(verified.nodeHash).toBe('a'.repeat(64));

    await expect(verifyExternalNodesToken(`${token}x`, secret)).rejects.toThrow(/invalid/i);

    const expired = await createExternalNodesToken({
      profileId: 'profile-a',
      nodeHash: 'b'.repeat(64),
      secret,
      expiresInSeconds: -1,
    });
    await expect(verifyExternalNodesToken(expired, secret)).rejects.toThrow(/expired/i);
  });

  it('builds a public callback url without leaking the cache key', async () => {
    const token = 'payload.signature';
    const callbackUrl = buildExternalNodesCallbackUrl(
      'https://misub.example/stable-token?target=clash&refresh=1',
      token,
    );

    expect(callbackUrl).toBe('https://misub.example/api/external-nodes-callback?token=payload.signature');
    expect(callbackUrl).not.toContain('tmp_external_nodes');
    expect(callbackUrl).not.toContain('refresh=1');
  });

  it('serves cached callback nodes as plain text and returns 410 when cache is missing', async () => {
    const secret = 'unit-test-secret';
    const nodesText = 'ss://node-a#A\n';
    const env = { MISUB_DB: createMemoryD1(), CALLBACK_TOKEN_SECRET: secret };
    const putResult = await putExternalNodes({ env, profileId: 'profile-a', nodesText });
    const token = await createExternalNodesToken({
      profileId: 'profile-a',
      nodeHash: putResult.nodeHash,
      secret,
      expiresInSeconds: 120,
    });

    clearExternalNodesMemoryCache();
    const response = await handleExternalNodesCallbackRequest(
      new Request(`https://misub.example/api/external-nodes-callback?token=${encodeURIComponent(token)}`),
      env,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('text/plain');
    expect(response.headers.get('Cache-Control')).toContain('no-store');
    expect(await response.text()).toBe('ss://node-a#A\n');

    const missingResponse = await handleExternalNodesCallbackRequest(
      new Request(`https://misub.example/api/external-nodes-callback?token=${encodeURIComponent(token)}`),
      {
        MISUB_DB: createMemoryD1(),
        CALLBACK_TOKEN_SECRET: secret,
      },
    );
    expect(missingResponse.status).toBe(410);
  });

  it('can serve cached callback nodes as base64 for subconverter remote URL fetches', async () => {
    const secret = 'unit-test-secret';
    const nodesText = 'ss://node-a#A\nss://node-b#B\n';
    const env = { MISUB_DB: createMemoryD1(), CALLBACK_TOKEN_SECRET: secret };
    const putResult = await putExternalNodes({ env, profileId: 'profile-a', nodesText });
    const token = await createExternalNodesToken({
      profileId: 'profile-a',
      nodeHash: putResult.nodeHash,
      secret,
      expiresInSeconds: 120,
    });

    clearExternalNodesMemoryCache();
    const response = await handleExternalNodesCallbackRequest(
      new Request('https://misub.example/api/external-nodes-callback?token=' + token + '&encoding=base64'),
      env,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('X-MiSub-Callback-Encoding')).toBe('base64');
    expect(await response.text()).toBe(btoa(nodesText));
  });

  it('falls back to process memory cache when durable storage is unavailable', async () => {
    clearExternalNodesMemoryCache();
    const nodesText = 'ss://memory-node#A\n';
    const putResult = await putExternalNodes({
      env: {},
      profileId: 'profile-memory',
      nodesText,
    });
    const cached = await getExternalNodes({
      env: {},
      profileId: 'profile-memory',
      nodeHash: putResult.nodeHash,
    });

    expect(putResult.storage).toBe('memory');
    expect(cached).toBe(nodesText);
  });
});
