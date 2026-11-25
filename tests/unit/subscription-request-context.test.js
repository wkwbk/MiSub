import { describe, expect, it } from 'vitest';
import { resolveRequestContext } from '../../functions/modules/subscription/core/request-context.js';

const defaultConfig = {
  myToken: 'stable-token',
  profileToken: 'sub',
};

const customPathConfig = {
  myToken: 'stable-token',
  profileToken: 'links',
};

describe('subscription request context routing', () => {
  it('resolves unified /{subPath}/{identifier} for default subscription and profiles', () => {
    expect(resolveRequestContext(new URL('https://example.com/sub/stable-token'), defaultConfig)).toEqual({
      token: 'stable-token',
      profileIdentifier: null,
    });

    expect(resolveRequestContext(new URL('https://example.com/sub/group-a'), defaultConfig)).toEqual({
      token: 'sub',
      profileIdentifier: 'group-a',
    });
  });

  it('supports custom subscription URL path prefix and rejects default /sub when changed', () => {
    expect(resolveRequestContext(new URL('https://example.com/links/stable-token'), customPathConfig)).toEqual({
      token: 'stable-token',
      profileIdentifier: null,
    });

    expect(resolveRequestContext(new URL('https://example.com/links/group-a'), customPathConfig)).toEqual({
      token: 'links',
      profileIdentifier: 'group-a',
    });

    expect(resolveRequestContext(new URL('https://example.com/sub/stable-token'), customPathConfig)).toEqual({
      token: '',
      profileIdentifier: null,
    });
  });

  it('falls back to /sub when profileToken is blank', () => {
    const blankPathConfig = { myToken: 'stable-token', profileToken: '' };

    expect(resolveRequestContext(new URL('https://example.com/sub/stable-token'), blankPathConfig)).toEqual({
      token: 'stable-token',
      profileIdentifier: null,
    });

    expect(resolveRequestContext(new URL('https://example.com/sub/group-a'), blankPathConfig)).toEqual({
      token: 'sub',
      profileIdentifier: 'group-a',
    });
  });

  it('rejects legacy single-segment, three-segment, and mismatched prefix paths', () => {
    expect(resolveRequestContext(new URL('https://example.com/stable-token'), defaultConfig)).toEqual({
      token: '',
      profileIdentifier: null,
    });

    expect(resolveRequestContext(new URL('https://example.com/sub/profiles/group-a'), defaultConfig)).toEqual({
      token: '',
      profileIdentifier: null,
    });

    expect(resolveRequestContext(new URL('https://example.com/s/stable-token'), defaultConfig)).toEqual({
      token: '',
      profileIdentifier: null,
    });

    expect(resolveRequestContext(new URL('https://example.com/random/links/group-a'), customPathConfig)).toEqual({
      token: '',
      profileIdentifier: null,
    });
  });
});
