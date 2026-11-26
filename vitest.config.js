import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [
    vue({
      template: {
        transformAssetUrls: false,
      },
    }),
    {
      name: 'vitest-cloudflare-sockets-stub',
      resolveId(id) {
        if (id === 'cloudflare:sockets') {
          return '\0virtual:cloudflare-sockets';
        }
      },
      load(id) {
        if (id === '\0virtual:cloudflare-sockets') {
          return 'export const connect = undefined;\n';
        }
      },
    },
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
