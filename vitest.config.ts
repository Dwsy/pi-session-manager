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
    // Polyfills run for every test file; the setup file is defensive (guards
    // each polyfill with a typeof check) so node-environment tests are unaffected.
    setupFiles: ['./vitest.setup.ts'],
    globals: false,
    server: {
      deps: {
        // These packages publish extensionless ESM submodule imports. Keep them
        // in Vite's transform pipeline so Vitest resolves them consistently
        // on Node versions used locally and in CI.
        inline: [
          '@emoji-mart/data',
          '@emoji-mart/react',
          '@lobehub/fluent-emoji',
          '@lobehub/icons',
          '@lobehub/ui',
          'emoji-mart',
        ],
      },
    },
    include: [
      'src/**/*.test.{ts,tsx}',
      'extensions/**/*.test.{ts,tsx}',
      'vite.config.test.ts',
    ],
  },
})
