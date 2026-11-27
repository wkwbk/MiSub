import { defineStore } from 'pinia';
import { nextTick, ref } from 'vue';
import { readRawPreference, writeRawPreference } from '@/utils/local-preference.js';

export type ThemeMode = 'light' | 'dark';

export const useThemeStore = defineStore('theme', () => {
  const theme = ref<ThemeMode>('light');
  let activeTransitionId = 0;

  function initTheme(): void {
    const savedTheme = readRawPreference('theme');
    if (savedTheme === 'light' || savedTheme === 'dark') {
      theme.value = savedTheme;
    } else if (savedTheme) {
      theme.value = savedTheme as ThemeMode;
    } else {
      const prefersDark =
        typeof window !== 'undefined' &&
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(prefers-color-scheme: dark)').matches;
      theme.value = prefersDark ? 'dark' : 'light';
    }
    updateThemeClass();
  }

  function applyTheme(nextTheme: ThemeMode): void {
    theme.value = nextTheme;
    writeRawPreference('theme', nextTheme);
    updateThemeClass();
  }

  function toggleTheme(options?: { instant?: boolean } | Event): void {
    const nextTheme: ThemeMode = theme.value === 'light' ? 'dark' : 'light';
    const isInstant = Boolean(options && typeof options === 'object' && 'instant' in options && options.instant);

    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const canUseViewTransition =
      !isInstant &&
      typeof document !== 'undefined' &&
      typeof document.startViewTransition === 'function' &&
      !prefersReducedMotion;

    if (!canUseViewTransition) {
      if (typeof document !== 'undefined') {
        const root = document.documentElement;
        root.classList.add('theme-switching');
        applyTheme(nextTheme);
        void root.offsetHeight;
        const clearSwitching = () => root.classList.remove('theme-switching');
        if (typeof requestAnimationFrame === 'function') {
          requestAnimationFrame(clearSwitching);
        } else {
          clearSwitching();
        }
      } else {
        applyTheme(nextTheme);
      }
      return;
    }

    const root = document.documentElement;
    const transitionId = ++activeTransitionId;

    root.classList.add('theme-switching', 'theme-view-transition-sweep');

    const transition = document.startViewTransition(async () => {
      applyTheme(nextTheme);
      await nextTick();
    });

    const clipPathKeyframes =
      nextTheme === 'dark'
        ? ['polygon(0% 0%, 0% 0%, -12% 100%, -12% 100%)', 'polygon(0% 0%, 112% 0%, 100% 100%, -12% 100%)']
        : ['polygon(112% 0%, 112% 0%, 100% 100%, 100% 100%)', 'polygon(0% 0%, 112% 0%, 100% 100%, -12% 100%)'];

    transition.ready
      .then(() => {
        root.animate(
          {
            clipPath: clipPathKeyframes,
          },
          {
            duration: 500,
            easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
            pseudoElement: '::view-transition-new(root)',
          },
        );
      })
      .catch(() => {});

    transition.finished
      .catch(() => {})
      .finally(() => {
        if (transitionId === activeTransitionId) {
          root.classList.remove('theme-switching', 'theme-view-transition-sweep');
        }
      });
  }

  function updateThemeClass() {
    if (theme.value === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }

    updateStatusBarTheme();
  }

  function updateStatusBarTheme() {
    const themeColorMeta = document.querySelector('meta[name="theme-color"]:not([media])');
    if (themeColorMeta) {
      if (theme.value === 'dark') {
        themeColorMeta.setAttribute('content', '#0f172a');
      } else {
        themeColorMeta.setAttribute('content', '#f8fafc');
      }
    }

    const statusBarMeta = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');
    if (statusBarMeta) {
      statusBarMeta.setAttribute('content', 'black-translucent');
    }
  }

  return { theme, initTheme, toggleTheme };
});
