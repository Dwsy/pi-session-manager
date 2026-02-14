import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { codeInspectorPlugin } from 'code-inspector-plugin'

export default defineConfig({
  plugins: [
    codeInspectorPlugin({ bundler: 'vite' }),
    react(),
  ],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    allowedHosts: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:52131',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://127.0.0.1:52131',
        ws: true,
      },
    },
    watch: {
      ignored: ['**/src-tauri/**'],
    },
    hmr: {
      overlay: false,
    },
  },
})