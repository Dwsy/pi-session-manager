import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

const dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(dirname, '../..')

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(repoRoot, 'src'),
      '@pi-session-manager/plugin-sdk': path.resolve(repoRoot, 'packages/runtime-sdk/src'),
    },
  },
  build: {
    lib: {
      entry: path.resolve(dirname, 'psm-plugin.tsx'),
      formats: ['es'],
      fileName: () => 'index.mjs',
    },
    rollupOptions: {
      external: ['react', 'react-dom', 'react/jsx-runtime'],
    },
  },
})
