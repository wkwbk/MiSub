import { describe, expect, it } from 'vitest';
import { resolveSafeLoginRedirect } from '@/utils/login-path.js';
import { getPathRootSegment, isReservedPathRoot } from '@shared/reserved-paths.js';

describe('shared reserved path validation', () => {
  it('extracts normalized first path segment', () => {
    expect(getPathRootSegment('/Login/extra')).toBe('login');
    expect(getPathRootSegment('  ///Dashboard/settings ')).toBe('dashboard');
    expect(getPathRootSegment('')).toBe('');
  });

  it('rejects system reserved roots and allows custom paths', () => {
    expect(isReservedPathRoot('login')).toBe(true);
    expect(isReservedPathRoot('/api/v1')).toBe(true);
    expect(isReservedPathRoot('/dashboard')).toBe(true);
    expect(isReservedPathRoot('/secret-panel')).toBe(false);
    expect(isReservedPathRoot('admin-gate')).toBe(false);
  });
});

describe('resolveSafeLoginRedirect', () => {
  it('allows safe internal relative paths', () => {
    expect(resolveSafeLoginRedirect('/dashboard/settings')).toBe('/dashboard/settings');
    expect(resolveSafeLoginRedirect(' /dashboard/nodes?tab=1 ')).toBe('/dashboard/nodes?tab=1');
    expect(resolveSafeLoginRedirect(['/dashboard/groups', '/other'])).toBe('/dashboard/groups');
  });

  it('rejects external, protocol-relative, and login paths', () => {
    expect(resolveSafeLoginRedirect('https://evil.com')).toBe('/dashboard');
    expect(resolveSafeLoginRedirect('//evil.com')).toBe('/dashboard');
    expect(resolveSafeLoginRedirect('/login')).toBe('/dashboard');
    expect(resolveSafeLoginRedirect('/secret-login', '/dashboard', ['/secret-login'])).toBe('/dashboard');
    expect(resolveSafeLoginRedirect(undefined)).toBe('/dashboard');
  });
});
