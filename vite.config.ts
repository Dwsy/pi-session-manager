import fs from 'fs'
import path from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { codeInspectorPlugin } from 'code-inspector-plugin'
import { VitePWA } from 'vite-plugin-pwa'

function normalizeVersion(value: string): string {
  return value.trim().replace(/^v/i, '')
}

function resolveBuildVersion(): string {
  const packageVersion = process.env.npm_package_version
  if (typeof packageVersion === 'string' && packageVersion.trim().length > 0) {
    return normalizeVersion(packageVersion)
  }
  return '0.0.0'
}

function getPsmPort(): number {
  // CLI dev mode: use env var from dev-cli.mjs
  if (process.env.CLI_SERVER_PORT) {
    return parseInt(process.env.CLI_SERVER_PORT, 10) || 52131
  }

  try {
    const configPath = path.join(
      process.env.HOME || '',
      '.config',
      'pi-session-manager.json'
    )
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
      return config.server?.http_port || 52131
    }
  } catch {
    // ignore
  }
  return 52131
}

const buildVersion = resolveBuildVersion()
const psmPort = getPsmPort()

export default defineConfig(({ mode }) => {
  const isDemoBuild = mode === 'demo'
  const isDatasetBuild = mode === 'dataset'
  const isCliDev = mode === 'cli-dev'

  return {
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
      outDir: isDemoBuild ? 'dist-demo' : isDatasetBuild ? 'dist-dataset' : 'dist',
      rollupOptions: {
        output: {
          manualChunks(id) {
            const vendorChunks: Record<string, string[]> = {
              'react-vendor': ['react', 'react-dom'],
              'ui-vendor': ['lucide-react', 'cmdk', '@dnd-kit/core', '@dnd-kit/sortable', '@dnd-kit/utilities'],
              'flow-vendor': ['@xyflow/react'],
              'terminal-vendor': ['@xterm/xterm', '@xterm/addon-fit'],
              'chart-vendor': ['recharts'],
              'markdown-vendor': ['marked', '@shikijs/core', '@shikijs/engine-javascript', '@pierre/diffs'],
              'i18n-vendor': ['i18next', 'react-i18next', 'i18next-browser-languagedetector'],
            }

            for (const [chunkName, packages] of Object.entries(vendorChunks)) {
              if (packages.some((pkg) => id.includes(`/node_modules/${pkg}/`))) {
                return chunkName
              }
            }
          },
        },
      },
    },
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
        '@pi-session-manager/plugin-sdk': path.resolve(__dirname, './packages/runtime-sdk/src/index.ts'),
      },
    },
    clearScreen: false,
    server: isCliDev
      ? {
          // CLI dev mode: use same port as Tauri dev (1420), proxy to CLI server
          port: 1420,
          strictPort: true,
          allowedHosts: true,
          proxy: {
            '/api': {
              target: `http://127.0.0.1:${getPsmPort()}`,
              changeOrigin: true,
            },
            '/ws': {
              target: `ws://127.0.0.1:${getPsmPort()}`,
              ws: true,
            },
          },
          hmr: {
            overlay: false,
          },
        }
      : {
          port: 1420,
          strictPort: true,
          allowedHosts: true,
          proxy: {
            '/api': {
              target: `http://127.0.0.1:${psmPort}`,
              changeOrigin: true,
            },
            '/ws': {
              target: `ws://127.0.0.1:${psmPort}`,
              ws: true,
            },
          },
          watch: {
            ignored: [
              '**/src-tauri/**',
              '**/target/**',
              '**/*.rs',
              '**/Cargo.toml',
              '**/Cargo.lock',
            ],
          },
          hmr: {
            overlay: false,
          },
        },
  }
})
