import { describe, expect, it } from 'vitest';
import { isValidCustomLoginPath, resolveSafeLoginRedirect } from '@/utils/login-path.js';

describe('isValidCustomLoginPath', () => {
    it('treats login as the default path instead of a custom-only route', () => {
        expect(isValidCustomLoginPath('login')).toBe(false);
        expect(isValidCustomLoginPath('/login')).toBe(false);
        expect(isValidCustomLoginPath(' /login ')).toBe(false);
    });

    it('rejects empty and slash-only values', () => {
        expect(isValidCustomLoginPath('')).toBe(false);
        expect(isValidCustomLoginPath('/')).toBe(false);
        expect(isValidCustomLoginPath('   ')).toBe(false);
    });

    it('accepts non-login custom paths', () => {
        expect(isValidCustomLoginPath('admin-login')).toBe(true);
        expect(isValidCustomLoginPath('/admin-login')).toBe(true);
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
        expect(resolveSafeLoginRedirect('/secret-login', '/dashboard', ['/secret-login'])).toBe(
            '/dashboard'
        );
        expect(resolveSafeLoginRedirect(undefined)).toBe('/dashboard');
    });
});
