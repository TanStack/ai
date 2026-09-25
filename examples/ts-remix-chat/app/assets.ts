import { createAssetServer } from 'remix/assets'
import { uiHmr } from 'remix/ui-hmr/assets'

const rootDir = process.cwd()
const nodeEnv = process.env.NODE_ENV ?? 'development'
const isDevelopment = nodeEnv === 'development'
const isHmr = Boolean(isDevelopment && process.env.REMIX_NODE_HMR)

export const assets = createAssetServer({
  basePath: '/assets',
  rootDir,
  // pnpm stores workspace packages under the repo root. Mount that store so
  // `remix/ui` and `@tanstack/*` resolve inside a configured mount.
  mounts: {
    app: 'app',
    npm: 'node_modules',
    workspace: '../../node_modules',
    packages: '../../packages',
  },

  allowFiles: [
    'app/routes.ts',
    'app/**/public/**',
    'app/ui/**',
    'app/lib/**',
    'app/data/**',
    'app/shims/**',
  ],
  allowPackages: [
    'remix',
    '@tanstack/ai-remix',
    '@tanstack/ai-client',
    '@tanstack/ai',
    'zod',
  ],
  denyFiles: ['app/**/*.test.*'],
  sourceMaps: isDevelopment ? 'external' : undefined,
  minify: !isDevelopment,
  watch: isDevelopment,
  hmr: isHmr
    ? async () =>
        (await import('remix/node-hmr/runtime')).createBrowserHmrChannel()
    : undefined,
  scripts: {
    // Remix's unbundled asset server cannot compile this CJS package.
    external: ['partial-json'],
    loaders: isHmr ? [uiHmr()] : undefined,
  },
})

const entry = 'app/actions/public/entry.ts'

export const entryHref = await assets.getHref(entry)
export const entryPreloads = await assets.getPreloads(entry)
export const partialJsonHref = await assets.getHref('app/shims/partial-json.ts')
