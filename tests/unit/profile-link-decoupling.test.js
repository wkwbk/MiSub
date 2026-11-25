import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  generateProfileLinkId,
  getProfileShareIdentifier,
  matchesPublicProfileIdentifier,
  resolvePublicProfile,
  rotateProfileLinkId,
} from '@misub/core/domain/profile-link.js';
import { validateProfileAliases, validateSingleProfileAlias } from '@misub/core/domain/profile-alias.js';
import { handleDataRequest, handleMisubsSave } from '../../functions/modules/api-handler.js';
import { handleApiRequest } from '../../functions/modules/api-router.js';
import { LogService } from '../../functions/services/log-service.js';
import { StorageFactory } from '../../functions/storage-adapter.js';
import { COOKIE_NAME, STORAGE_KEY_SETTINGS } from '../../functions/modules/config.js';
import { createSignedToken, getSessionSigningSecret } from '../../functions/modules/auth-middleware.js';

describe('profile linkId decoupling, alias validation & scoped log clearing (B.6)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('prioritizes customId > linkId > unmigrated id and retires old identifiers', () => {
    const withCustom = { id: 'prof_internal', linkId: 'p_abc123def456', customId: 'vip' };
    expect(getProfileShareIdentifier(withCustom)).toBe('vip');
    expect(matchesPublicProfileIdentifier(withCustom, 'VIP')).toBe(true);
    expect(matchesPublicProfileIdentifier(withCustom, 'p_abc123def456')).toBe(false);
    expect(matchesPublicProfileIdentifier(withCustom, 'prof_internal')).toBe(false);

    const migratedNoCustom = { id: 'prof_internal', linkId: 'p_abc123def456', customId: '' };
    expect(getProfileShareIdentifier(migratedNoCustom)).toBe('p_abc123def456');
    expect(matchesPublicProfileIdentifier(migratedNoCustom, 'p_abc123def456')).toBe(true);
    expect(matchesPublicProfileIdentifier(migratedNoCustom, 'prof_internal')).toBe(false);

    const legacyUnmigrated = { id: 'legacy_1', linkId: '', customId: '' };
    expect(getProfileShareIdentifier(legacyUnmigrated)).toBe('legacy_1');
    expect(matchesPublicProfileIdentifier(legacyUnmigrated, 'legacy_1')).toBe(true);

    const rotated = rotateProfileLinkId(withCustom);
    expect(rotated.customId).toBe('');
    expect(rotated.linkId).not.toBe('p_abc123def456');
    expect(rotated.linkId).toMatch(/^p_[a-f0-9]{12}$/);
    expect(resolvePublicProfile([rotated], 'vip')).toBeNull();
    expect(resolvePublicProfile([rotated], rotated.linkId)?.id).toBe('prof_internal');
  });

  it('validates customId aliases with case-insensitive uniqueness, reserved words, and legacy exemption', () => {
    const existing = [
      { id: 'p1', customId: 'Game', linkId: generateProfileLinkId() },
      { id: 'p2', customId: '旧别名!', linkId: generateProfileLinkId() },
    ];

    expect(validateSingleProfileAlias('game', { currentProfileId: 'p3', profiles: existing })).toMatchObject({
      valid: false,
      code: 'duplicate',
    });

    expect(validateSingleProfileAlias('api', { currentProfileId: 'p3', profiles: existing })).toMatchObject({
      valid: false,
      code: 'reserved',
    });

    expect(validateSingleProfileAlias('bad space', { currentProfileId: 'p3', profiles: existing })).toMatchObject({
      valid: false,
      code: 'invalid_chars',
    });

    expect(validateSingleProfileAlias('a'.repeat(65), { currentProfileId: 'p3', profiles: existing })).toMatchObject({
      valid: false,
      code: 'too_long',
    });

    // Unchanged legacy customId is exempted on save
    expect(validateProfileAliases(existing, { previousProfiles: existing })).toEqual({ valid: true });

    // Changing to invalid chars removes legacy exemption
    const editedBad = [existing[0], { ...existing[1], customId: '新别名!' }];
    expect(validateProfileAliases(editedBad, { previousProfiles: existing })).toMatchObject({
      valid: false,
      code: 'invalid_chars',
      profileId: 'p2',
    });
  });

  it('lazy-migrates linkId on /api/data and rejects duplicate customId on /api/misubs', async () => {
    const storedProfiles = [{ id: 'p_legacy', name: 'Legacy', subscriptions: [], manualNodes: [] }];
    const syncAllProfiles = vi.fn().mockResolvedValue(true);
    const syncAllSubscriptions = vi.fn().mockResolvedValue(true);

    const adapter = {
      type: 'd1',
      getAllSubscriptions: vi.fn().mockResolvedValue([]),
      getAllProfiles: vi.fn().mockResolvedValue(storedProfiles),
      get: vi.fn(async (key) => (key === STORAGE_KEY_SETTINGS ? {} : null)),
      syncAllProfiles,
      syncAllSubscriptions,
      list: vi.fn().mockResolvedValue([]),
    };
    vi.spyOn(StorageFactory, 'createAdapter').mockReturnValue(adapter);

    const dataRes = await handleDataRequest({ MISUB_DB: {} });
    const dataBody = await dataRes.json();
    expect(dataBody.profiles[0].linkId).toMatch(/^p_[a-f0-9]{12}$/);
    expect(syncAllProfiles).toHaveBeenCalledTimes(1);

    const badSaveReq = new Request('https://panel.example/api/misubs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        misubs: [],
        profiles: [
          { id: 'p1', name: 'One', customId: 'TeamA' },
          { id: 'p2', name: 'Two', customId: 'teama' },
        ],
      }),
    });
    const saveRes = await handleMisubsSave(badSaveReq, { MISUB_DB: {} });
    expect(saveRes.status).toBe(400);
    const saveJson = await saveRes.json();
    expect(saveJson.success).toBe(false);
    expect(saveJson.code).toBe('duplicate');
  });

  it('clears scoped logs by profileId and resets profile downloadCount atomically', async () => {
    const clearSpy = vi.spyOn(LogService, 'clearLogs').mockResolvedValue(true);
    const resetCountsSpy = vi.fn().mockResolvedValue(true);
    const adapter = {
      type: 'd1',
      get: vi.fn().mockResolvedValue({}),
      resetProfileDownloadCounts: resetCountsSpy,
    };
    vi.spyOn(StorageFactory, 'createAdapter').mockReturnValue(adapter);

    const env = { ADMIN_PASSWORD: 'secret-pass', COOKIE_SECRET: 'cookie-secret', MISUB_DB: {} };
    const signingKey = await getSessionSigningSecret(env);
    const token = await createSignedToken(signingKey, String(Date.now()));
    const cookie = `${COOKIE_NAME}=${token}`;

    const delReq = {
      url: 'https://panel.example/api/logs?profileId=p_1&profileName=Family',
      method: 'DELETE',
      headers: new Headers({ Cookie: cookie }),
    };
    const delRes = await handleApiRequest(delReq, env);
    expect(delRes.status).toBe(200);
    expect(clearSpy).toHaveBeenCalledWith(env, { profileId: 'p_1', profileName: 'Family' });
    expect(resetCountsSpy).toHaveBeenCalledWith({ profileId: 'p_1' });
  });
});
