// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  createBlockedResponse,
  enforcePublicApiAccess,
  evaluatePageAccess,
  isBrowserSubAccessAllowed,
  isCrawlerSubAccessBlocked,
  isPublicPageEnabled,
} from '../../functions/modules/access-control.js';
import { createDisguiseResponse } from '../../functions/modules/disguise-page.js';
import { createSignedToken, getSessionSigningSecret } from '../../functions/modules/auth-middleware.js';
import { COOKIE_NAME } from '../../functions/modules/config.js';

const testEnv = {
  ADMIN_PASSWORD: 'secret-password',
  COOKIE_SECRET: 'test-cookie-secret',
};

async function createAuthedRequest(url) {
  const secret = await getSessionSigningSecret(testEnv);
  const token = await createSignedToken(secret, String(Date.now()));
  return new Request(url, {
    headers: { Cookie: `${COOKIE_NAME}=${token}` },
  });
}

describe('web access control (single source of truth)', () => {
  it('blocks unauthenticated / and /explore with 404 when pageType is default even if redirectUrl has leftover text', async () => {
    const config = {
      enablePublicPage: false,
      disguise: { enabled: false, pageType: 'default', redirectUrl: 'https://stale.example.com' },
    };

    const homeRes = await evaluatePageAccess(new Request('https://example.com/'), testEnv, config);
    expect(homeRes.allow).toBe(false);
    expect(homeRes.response.status).toBe(404);
    expect(homeRes.response.headers.get('Location')).toBeNull();
    expect(await homeRes.response.text()).not.toContain('stale.example.com');

    const exploreRes = await evaluatePageAccess(new Request('https://example.com/explore'), testEnv, config);
    expect(exploreRes.allow).toBe(false);
    expect(exploreRes.response.status).toBe(404);

    // Login path remains accessible so the admin can never lock themselves out
    const loginRes = await evaluatePageAccess(new Request('https://example.com/login'), testEnv, config);
    expect(loginRes.allow).toBe(true);
  });

  it('redirects blocked pages when pageType is redirect even if browser subscription blocking is off', async () => {
    const config = {
      enablePublicPage: false,
      disguise: { enabled: false, pageType: 'redirect', redirectUrl: 'https://decoy.example.com' },
    };

    const homeRes = await evaluatePageAccess(new Request('https://example.com/'), testEnv, config);
    expect(homeRes.allow).toBe(false);
    expect(homeRes.response.status).toBe(302);
    expect(homeRes.response.headers.get('Location')).toBe('https://decoy.example.com/');

    const dashRes = await evaluatePageAccess(new Request('https://example.com/dashboard'), testEnv, config);
    expect(dashRes.allow).toBe(false);
    expect(dashRes.response.status).toBe(302);
    expect(dashRes.response.headers.get('Location')).toBe('https://decoy.example.com/');
  });

  it('allows public / and /explore when enablePublicPage is true even if disguise is enabled', async () => {
    const config = {
      enablePublicPage: true,
      disguise: { enabled: true, pageType: 'redirect', redirectUrl: 'https://decoy.example.com' },
    };

    expect((await evaluatePageAccess(new Request('https://example.com/'), testEnv, config)).allow).toBe(true);
    expect((await evaluatePageAccess(new Request('https://example.com/explore'), testEnv, config)).allow).toBe(true);

    // Protected dashboard is still blocked when unauthenticated
    const dashRes = await evaluatePageAccess(new Request('https://example.com/dashboard'), testEnv, config);
    expect(dashRes.allow).toBe(false);
    expect(dashRes.response.status).toBe(302);
  });

  it('allows authenticated admin access to / and /dashboard even when enablePublicPage is false', async () => {
    const config = {
      enablePublicPage: false,
      disguise: { enabled: true, pageType: 'default', redirectUrl: '' },
    };

    const authedHome = await createAuthedRequest('https://example.com/');
    const authedDash = await createAuthedRequest('https://example.com/dashboard/settings');

    expect((await evaluatePageAccess(authedHome, testEnv, config)).allow).toBe(true);
    expect((await evaluatePageAccess(authedDash, testEnv, config)).allow).toBe(true);
  });

  it('disables /login and opens custom login path when customLoginPath is configured', async () => {
    const config = {
      enablePublicPage: false,
      customLoginPath: 'secret-door',
      disguise: { enabled: true, pageType: 'redirect', redirectUrl: 'https://decoy.example.com' },
    };

    const oldLogin = await evaluatePageAccess(new Request('https://example.com/login'), testEnv, config);
    expect(oldLogin.allow).toBe(false);
    expect(oldLogin.response.status).toBe(302);

    const newLogin = await evaluatePageAccess(new Request('https://example.com/secret-door'), testEnv, config);
    expect(newLogin.allow).toBe(true);
  });

  it('blocks unauthenticated public APIs when enablePublicPage is false and allows authenticated admins', async () => {
    const disabledConfig = { enablePublicPage: false };
    const enabledConfig = { enablePublicPage: true };

    const blocked = await enforcePublicApiAccess(
      new Request('https://example.com/api/public/profiles'),
      testEnv,
      disabledConfig,
    );
    expect(blocked).not.toBeNull();
    expect(blocked.status).toBe(404);

    const authedAllowed = await enforcePublicApiAccess(
      await createAuthedRequest('https://example.com/api/public/profiles'),
      testEnv,
      disabledConfig,
    );
    expect(authedAllowed).toBeNull();

    const publicAllowed = await enforcePublicApiAccess(
      new Request('https://example.com/api/public/profiles'),
      testEnv,
      enabledConfig,
    );
    expect(publicAllowed).toBeNull();
  });

  it('never leaks stale redirectUrl when pageType is default', async () => {
    const staleConfig = { enabled: true, pageType: 'default', redirectUrl: 'https://leaked.example.com' };

    const blocked = createBlockedResponse(staleConfig, 'https://example.com/dashboard');
    expect(blocked.status).toBe(404);
    expect(blocked.headers.get('Location')).toBeNull();
    expect(blocked.headers.get('Cache-Control')).toContain('no-store');
    expect(await blocked.text()).not.toContain('leaked.example.com');

    const directDisguise = createDisguiseResponse(staleConfig, 'https://example.com/dashboard');
    expect(directDisguise.status).toBe(404);
    expect(directDisguise.headers.get('Location')).toBeNull();
  });

  it('treats missing enablePublicPage and allowBrowserSubAccess as true and string "false" as false', () => {
    expect(isPublicPageEnabled({})).toBe(true);
    expect(isPublicPageEnabled({ enablePublicPage: true })).toBe(true);
    expect(isPublicPageEnabled({ enablePublicPage: false })).toBe(false);
    expect(isPublicPageEnabled({ enablePublicPage: 'false' })).toBe(false);

    expect(isBrowserSubAccessAllowed({})).toBe(true);
    expect(isBrowserSubAccessAllowed({ allowBrowserSubAccess: true })).toBe(true);
    expect(isBrowserSubAccessAllowed({ allowBrowserSubAccess: false })).toBe(false);
    expect(isBrowserSubAccessAllowed({ allowBrowserSubAccess: 'false' })).toBe(false);

    expect(isCrawlerSubAccessBlocked({})).toBe(true);
    expect(isCrawlerSubAccessBlocked({ blockCrawlerSubAccess: true })).toBe(true);
    expect(isCrawlerSubAccessBlocked({ blockCrawlerSubAccess: false })).toBe(false);
    expect(isCrawlerSubAccessBlocked({ blockCrawlerSubAccess: 'false' })).toBe(false);
  });
});
