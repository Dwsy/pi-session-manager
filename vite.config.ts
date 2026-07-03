import fs from 'fs'
import path from 'path'
import os from 'os'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { codeInspectorPlugin } from 'code-inspector-plugin'
import { VitePWA } from 'vite-plugin-pwa'

// Cross-platform user home: Windows uses USERPROFILE (HOME is usually unset,
// and when set by Git Bash/MSYS may point to a Unix-style path Win32 can't open).
function userHome(env: NodeJS.ProcessEnv = process.env): string {
  return env.HOME || env.USERPROFILE || os.homedir()
}

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

export const DEFAULT_PSM_PORT = 52131

export interface PsmProxyTarget {
  httpTarget: string
  wsTarget: string
}

export interface PsmClientEnv {
  httpBaseUrl: string
  wsUrl: string
}

/**
 * Normalize a PSM base URL (either `ws://host:port[/ws]` or `http://host:port`)
 * into matched http + ws targets. ws path defaults to `/ws`.
 */
export function resolvePsmProxyTarget(psmUrl: string): PsmProxyTarget {
  const trimmed = psmUrl.trim()
  let httpBase: string
  let wsPath = '/ws'

  if (trimmed.startsWith('ws://') || trimmed.startsWith('wss://')) {
    const scheme = trimmed.startsWith('wss://') ? 'https' : 'http'
    const after = trimmed.slice(trimmed.indexOf('://') + 3)
    const slashIdx = after.indexOf('/')
    const hostPart = slashIdx === -1 ? after : after.slice(0, slashIdx)
    if (slashIdx !== -1) {
      const pathPart = after.slice(slashIdx).replace(/\/+$/, '')
      if (pathPart.length > 0) wsPath = pathPart
    }
    httpBase = `${scheme}://${hostPart}`
  } else {
    // treat as http base; strip any trailing path for the host, but keep it as ws path
    const after = trimmed.includes('://') ? trimmed.slice(trimmed.indexOf('://') + 3) : trimmed
    const slashIdx = after.indexOf('/')
    const hostPart = slashIdx === -1 ? after : after.slice(0, slashIdx)
    const scheme = trimmed.startsWith('https://') ? 'https' : 'http'
    if (slashIdx !== -1) {
      const pathPart = after.slice(slashIdx).replace(/\/+$/, '')
      if (pathPart.length > 0) wsPath = pathPart
    }
    httpBase = `${scheme}://${hostPart}`
  }

  return {
    httpTarget: httpBase,
    wsTarget: `${httpBase.replace(/^http/, 'ws')}${wsPath}`,
  }
}

function readConfigPort(env: NodeJS.ProcessEnv): number | null {
  try {
    // Must match the backend: ~/.pi/pi-session-manager/config.json
    // (see src-tauri paths.rs psm_root_dir + unified_config.rs config_file_path).
    const configPath = path.join(
      userHome(env),
      '.pi',
      'pi-session-manager',
      'config.json',
    )
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
      const port = config?.server?.http_port
      if (typeof port === 'number' && Number.isFinite(port)) {
        return port
      }
    }
  } catch {
    // ignore — fall back to default
  }
  return null
}

function resolveBaseUrl(env: NodeJS.ProcessEnv): string {
  // Explicit override wins (used by tests / remote dev).
  if (env.PSM_URL && env.PSM_URL.trim().length > 0) {
    return env.PSM_URL.trim()
  }
  // CLI dev mode: dev-cli.mjs passes the CLI server port via this env var.
  if (env.CLI_SERVER_PORT) {
    const port = parseInt(env.CLI_SERVER_PORT, 10)
    if (Number.isFinite(port) && port > 0) {
      return `http://127.0.0.1:${port}`
    }
  }
  const port = readConfigPort(env) ?? DEFAULT_PSM_PORT
  return `http://127.0.0.1:${port}`
}

/** Resolve the http + ws proxy targets honoring PSM_URL > CLI_SERVER_PORT > config file > default. */
export function getPsmProxyTarget(env: NodeJS.ProcessEnv = process.env): PsmProxyTarget {
  return resolvePsmProxyTarget(resolveBaseUrl(env))
}

/** Resolve the http/ws URLs injected into the browser client (same source as the proxy). */
export function getPsmClientEnv(env: NodeJS.ProcessEnv = process.env): PsmClientEnv {
  const { httpTarget, wsTarget } = getPsmProxyTarget(env)
  return { httpBaseUrl: httpTarget, wsUrl: wsTarget }
}

const buildVersion = resolveBuildVersion()
const psmPort = (() => {
  const { httpTarget } = getPsmProxyTarget()
  const match = httpTarget.match(/:(\d+)$/)
  return match ? parseInt(match[1], 10) : DEFAULT_PSM_PORT
})()

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
        '@google/genai': path.resolve(__dirname, './src/utils/empty.ts'),
      },
    },
    clearScreen: false,
    server: isCliDev
      ? (() => {
          // CLI dev mode: use same port as Tauri dev (1420), proxy to CLI server.
          // CLI_SERVER_PORT is resolved inside getPsmProxyTarget.
          const { httpTarget, wsTarget } = getPsmProxyTarget()
          return {
            port: 1420,
            strictPort: true,
            allowedHosts: true,
            proxy: {
              '/api': {
                target: httpTarget,
                changeOrigin: true,
              },
              '/ws': {
                target: wsTarget,
                ws: true,
              },
            },
            hmr: {
              overlay: false,
            },
          }
        })()
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
