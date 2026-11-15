import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useThemeStore } from '../../src/stores/theme.js';

describe('useThemeStore', () => {
    let originalStartViewTransition;
    let originalMatchMedia;
    let originalRaf;

    beforeEach(() => {
        setActivePinia(createPinia());
        localStorage.clear();
        document.documentElement.className = '';
        originalStartViewTransition = document.startViewTransition;
        originalMatchMedia = window.matchMedia;
        originalRaf = globalThis.requestAnimationFrame;
    });

    afterEach(() => {
        document.startViewTransition = originalStartViewTransition;
        window.matchMedia = originalMatchMedia;
        globalThis.requestAnimationFrame = originalRaf;
        vi.restoreAllMocks();
    });

    it('uses transition suppression fallback when View Transitions API is unavailable', () => {
        delete document.startViewTransition;
        let rafCallback = null;
        globalThis.requestAnimationFrame = vi.fn((cb) => {
            rafCallback = cb;
            return 1;
        });

        const store = useThemeStore();
        expect(store.theme).toBe('light');

        store.toggleTheme();

        expect(store.theme).toBe('dark');
        expect(document.documentElement.classList.contains('dark')).toBe(true);
        expect(document.documentElement.classList.contains('theme-switching')).toBe(true);
        expect(rafCallback).toBeTypeOf('function');

        rafCallback();
        expect(document.documentElement.classList.contains('theme-switching')).toBe(false);
    });

    it('skips View Transitions when prefers-reduced-motion is reduce', () => {
        const startViewTransition = vi.fn();
        document.startViewTransition = startViewTransition;
        window.matchMedia = vi.fn().mockReturnValue({ matches: true });
        globalThis.requestAnimationFrame = vi.fn((cb) => cb());

        const store = useThemeStore();
        store.toggleTheme({ clientX: 100, clientY: 50 });

        expect(startViewTransition).not.toHaveBeenCalled();
        expect(store.theme).toBe('dark');
        expect(document.documentElement.classList.contains('dark')).toBe(true);
        expect(document.documentElement.classList.contains('theme-switching')).toBe(false);
    });

    it('uses View Transitions API with diagonal sweep animation when supported', async () => {
        let resolveReady;
        let resolveFinished;
        const animateMock = vi.fn();
        document.documentElement.animate = animateMock;
        window.matchMedia = vi.fn().mockReturnValue({ matches: false });

        document.startViewTransition = vi.fn((cb) => {
            const ready = new Promise((r) => {
                resolveReady = r;
            });
            const finished = new Promise((r) => {
                resolveFinished = r;
            });
            Promise.resolve().then(() => cb());
            return { ready, finished };
        });

        const store = useThemeStore();
        store.toggleTheme();

        expect(document.startViewTransition).toHaveBeenCalledTimes(1);
        expect(document.documentElement.classList.contains('theme-switching')).toBe(true);
        expect(document.documentElement.classList.contains('theme-view-transition-sweep')).toBe(true);

        resolveReady();
        await Promise.resolve();
        await Promise.resolve();

        expect(store.theme).toBe('dark');
        expect(animateMock).toHaveBeenCalledWith(
            {
                clipPath: [
                    'polygon(0% 0%, 0% 0%, -12% 100%, -12% 100%)',
                    'polygon(0% 0%, 112% 0%, 100% 100%, -12% 100%)',
                ],
            },
            expect.objectContaining({
                duration: 500,
                pseudoElement: '::view-transition-new(root)',
            })
        );

        resolveFinished();
        await Promise.resolve();
        await Promise.resolve();

        expect(document.documentElement.classList.contains('theme-switching')).toBe(false);
        expect(document.documentElement.classList.contains('theme-view-transition-sweep')).toBe(false);
    });

    it('does not let an aborted earlier transition clear classes for a newer transition', async () => {
        const transitions = [];
        document.documentElement.animate = vi.fn();
        window.matchMedia = vi.fn().mockReturnValue({ matches: false });

        document.startViewTransition = vi.fn((cb) => {
            let rejectFinished;
            let resolveFinished;
            const ready = Promise.reject(new Error('aborted'));
            const finished = new Promise((res, rej) => {
                resolveFinished = res;
                rejectFinished = rej;
            });
            transitions.push({ resolveFinished, rejectFinished });
            cb();
            return { ready, finished };
        });

        const store = useThemeStore();
        store.toggleTheme({ clientX: 10, clientY: 10 });
        store.toggleTheme({ clientX: 10, clientY: 10 });

        transitions[0].rejectFinished(new Error('skipped'));
        await Promise.resolve();
        await Promise.resolve();

        // Second transition is still active, so classes must remain
        expect(document.documentElement.classList.contains('theme-switching')).toBe(true);

        transitions[1].resolveFinished();
        await Promise.resolve();
        await Promise.resolve();

        expect(document.documentElement.classList.contains('theme-switching')).toBe(false);
    });
});
