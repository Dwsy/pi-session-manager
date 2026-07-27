import { defineConfig } from 'vitest/config'
import path from 'node:path'

// Dedicated vitest config, kept separate from vite.config.ts so the build
// pipeline is unaffected. Loaded automatically by vitest. Individual test
// files opt into jsdom via the `// @vitest-environment jsdom` pragma; we keep
// the default environment as node so pure-logic tests stay lightweight.
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@components': path.resolve(__dirname, './src/components'),
      '@hooks': path.resolve(__dirname, './src/hooks'),
      '@utils': path.resolve(__dirname, './src/utils'),
      '@types': path.resolve(__dirname, './src/types'),
      '@contexts': path.resolve(__dirname, './src/contexts'),
      '@plugins': path.resolve(__dirname, './src/plugins'),
      '@demo': path.resolve(__dirname, './src/demo'),
      '@styles': path.resolve(__dirname, './src/styles'),
      '@pi-session-manager/plugin-sdk': path.resolve(
        __dirname,
        './packages/runtime-sdk/src/index.ts',
      ),
    },
  },
  test: {
    server: {
      deps: {
        // This package ships extensionless ESM directory imports that Node cannot resolve.
        inline: ['@lobehub/ui', '@lobehub/fluent-emoji'],
      },
    },
    // Polyfills run for every test file; the setup file is defensive (guards
    // each polyfill with a typeof check) so node-environment tests are unaffected.
    setupFiles: ['./vitest.setup.ts'],
    globals: false,
    include: [
      'src/**/*.test.{ts,tsx}',
      'extensions/**/*.test.{ts,tsx}',
      'vite.config.test.ts',
    ],
  },
})
