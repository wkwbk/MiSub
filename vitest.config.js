import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [
    vue({
      template: {
        transformAssetUrls: false,
      },
    }),
  ],
  test: {
    globals: true,
    pool: 'vmThreads',
    environment: 'happy-dom',
    setupFiles: ['tests/setup/i18n-preload.js', 'tests/setup/async-components.js'],
    passWithNoTests: true,
    include: ['tests/**/*.{test,spec}.{js,ts}'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/dev-dist/**', 'tests/e2e/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.{ts,vue}', 'functions/**/*.ts', 'packages/core/src/**/*.ts'],
      exclude: ['node_modules', 'dist', 'dev-dist'],
    },
  },
  resolve: {
    alias: [
      { find: '@', replacement: '/src' },
      { find: /^@misub\/core\/(.*)\.js$/, replacement: '/packages/core/src/$1.ts' },
      { find: '@misub/core', replacement: '/packages/core/src' },
    ],
  },
});
