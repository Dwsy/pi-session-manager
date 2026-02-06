import { defineConfig } from 'vite'
import { codeInspectorPlugin } from 'code-inspector-plugin'
import react from '@vitejs/plugin-react'

export default defineConfig(async () => ({
  plugins: [codeInspectorPlugin({ bundler: 'vite' }), react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      ignored: ['**/src-tauri/**'],
    },
    hmr: {
      overlay: false,
    },
  },
  logLevel: 'silent',
  customLogger: {
    info: () => {},
    warn: () => {},
    error: () => {},
    ready: () => {},
  },
}))