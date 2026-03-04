import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { codeInspectorPlugin } from 'code-inspector-plugin'
import { VitePWA } from 'vite-plugin-pwa'
import { execSync } from 'node:child_process'

function normalizeVersionTag(value: string): string {
  return value.trim().replace(/^refs\/tags\//, '').replace(/^v/i, '')
}

function isVersionLike(value: string): boolean {
  return /^[vV]?\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(value.trim())
}

function pickVersionFromMultiline(output: string): string | null {
  const lines = output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  for (const line of lines) {
    if (isVersionLike(line)) {
      return normalizeVersionTag(line)
    }
  }
  return null
}

function safeExec(command: string): string | null {
  try {
    return execSync(command, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    return null
  }
}

function resolveBuildVersion(): string {
  const explicitVersion =
    process.env.VITE_APP_VERSION ||
    process.env.GITHUB_REF_NAME ||
    (process.env.GITHUB_REF || '').replace(/^refs\/tags\//, '')

  if (explicitVersion && isVersionLike(explicitVersion)) {
    return normalizeVersionTag(explicitVersion)
  }

  const headTags = safeExec('git tag --points-at HEAD')
  if (headTags) {
    const headVersion = pickVersionFromMultiline(headTags)
    if (headVersion) return headVersion
  }

  const packageVersion = process.env.npm_package_version || '0.0.0'
  return normalizeVersionTag(packageVersion)
}

const buildVersion = resolveBuildVersion()

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(buildVersion),
  },
  plugins: [
    codeInspectorPlugin({ bundler: 'vite' }),
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon-128.png', 'icon-512.png'],
      manifest: {
        name: 'Pi Session Manager',
        short_name: 'Pi Sessions',
        description: 'Manage your Pi coding agent sessions',
        theme_color: '#1a1b26',
        background_color: '#1a1b26',
        display: 'standalone',
        orientation: 'portrait-primary',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: '/icon-128.png',
            sizes: '128x128',
            type: 'image/png',
          },
          {
            src: '/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: '/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
        ],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom'],
          'ui-vendor': ['lucide-react', 'cmdk', '@dnd-kit/core', '@dnd-kit/sortable', '@dnd-kit/utilities'],
          'flow-vendor': ['@xyflow/react'],
          'terminal-vendor': ['@xterm/xterm', '@xterm/addon-fit'],
          'chart-vendor': ['recharts'],
          'markdown-vendor': ['marked', 'highlight.js', '@pierre/diffs'],
          'i18n-vendor': ['i18next', 'react-i18next', 'i18next-browser-languagedetector'],
        },
      },
    },
  },
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
