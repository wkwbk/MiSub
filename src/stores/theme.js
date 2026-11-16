import { defineStore } from 'pinia';
import { nextTick, ref } from 'vue';
import { readRawPreference, writeRawPreference } from '@/utils/local-preference.js';

export const useThemeStore = defineStore('theme', () => {
    const theme = ref('light');
    let activeTransitionId = 0;

    function initTheme() {
        const savedTheme = readRawPreference('theme');
        if (savedTheme) {
            theme.value = savedTheme;
        } else {
            // 如果没有保存的主题，检查系统偏好
            const prefersDark =
                typeof window !== 'undefined' &&
                typeof window.matchMedia === 'function' &&
                window.matchMedia('(prefers-color-scheme: dark)').matches;
            theme.value = prefersDark ? 'dark' : 'light';
        }
        updateThemeClass();
    }

    function applyTheme(nextTheme) {
        theme.value = nextTheme;
        writeRawPreference('theme', nextTheme);
        updateThemeClass();
    }

    function toggleTheme() {
        const nextTheme = theme.value === 'light' ? 'dark' : 'light';

        const prefersReducedMotion =
            typeof window !== 'undefined' &&
            typeof window.matchMedia === 'function' &&
            window.matchMedia('(prefers-reduced-motion: reduce)').matches;

        const canUseViewTransition =
            typeof document !== 'undefined' &&
            typeof document.startViewTransition === 'function' &&
            !prefersReducedMotion;

        if (!canUseViewTransition) {
            if (typeof document !== 'undefined') {
                const root = document.documentElement;
                root.classList.add('theme-switching');
                applyTheme(nextTheme);
                // Force synchronous style flush while transitions are suppressed
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

        // Diagonal wipe: dark sweeps left-to-right, light sweeps right-to-left
        const clipPathKeyframes =
            nextTheme === 'dark'
                ? [
                      'polygon(0% 0%, 0% 0%, -12% 100%, -12% 100%)',
                      'polygon(0% 0%, 112% 0%, 100% 100%, -12% 100%)',
                  ]
                : [
                      'polygon(112% 0%, 112% 0%, 100% 100%, 100% 100%)',
                      'polygon(0% 0%, 112% 0%, 100% 100%, -12% 100%)',
                  ];

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
                    }
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

        // 动态更新状态栏主题颜色
        updateStatusBarTheme();
    }

    function updateStatusBarTheme() {
        // 更新主题颜色的 meta 标签
        const themeColorMeta = document.querySelector('meta[name="theme-color"]:not([media])');
        if (themeColorMeta) {
            if (theme.value === 'dark') {
                themeColorMeta.setAttribute('content', '#0f172a'); // 深色模式背景色
            } else {
                themeColorMeta.setAttribute('content', '#f8fafc'); // 浅色模式背景色
            }
        }

        // 更新 iOS 状态栏样式 - 统一使用黑色半透明配合Header渐变背景
        const statusBarMeta = document.querySelector(
            'meta[name="apple-mobile-web-app-status-bar-style"]'
        );
        if (statusBarMeta) {
            // 使用black-translucent让状态栏完全透明，由Header的渐变背景提供视觉效果
            statusBarMeta.setAttribute('content', 'black-translucent');
        }
    }

    return { theme, initTheme, toggleTheme };
});
