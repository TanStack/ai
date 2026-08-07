import type { IsolateDriver } from '@tanstack/ai-code-mode'

export type IsolateVM = 'node' | 'quickjs' | 'quickjs-bun' | 'cloudflare'

function isIsolateVM(value: unknown): value is IsolateVM {
  return (
    value === 'node' ||
    value === 'quickjs' ||
    value === 'quickjs-bun' ||
    value === 'cloudflare'
  )
}

/**
 * Default isolate for this process.
 *
 * - `CODE_MODE_DEFAULT_VM=node|quickjs|quickjs-bun|cloudflare` overrides everything
 * - `CODE_MODE_BUN=1` (or a real Bun runtime) → `quickjs-bun`
 * - otherwise → `node`
 *
 * Client UI defaults use `import.meta.env.VITE_CODE_MODE_BUN` (set from the
 * same flag in vite.config).
 */
export function getDefaultIsolateVM(): IsolateVM {
  const fromEnv =
    typeof process !== 'undefined'
      ? process.env.CODE_MODE_DEFAULT_VM
      : undefined
  if (isIsolateVM(fromEnv)) {
    return fromEnv
  }

  const bunMode =
    (typeof process !== 'undefined' && process.env.CODE_MODE_BUN === '1') ||
    typeof (globalThis as { Bun?: unknown }).Bun !== 'undefined'

  return bunMode ? 'quickjs-bun' : 'node'
}

/** Client-safe default (Vite injects `VITE_CODE_MODE_BUN` from CODE_MODE_BUN). */
export function getClientDefaultIsolateVM(): IsolateVM {
  try {
    if (isIsolateVM(import.meta.env.VITE_CODE_MODE_DEFAULT_VM)) {
      return import.meta.env.VITE_CODE_MODE_DEFAULT_VM
    }
    if (import.meta.env.VITE_CODE_MODE_BUN === '1') {
      return 'quickjs-bun'
    }
  } catch {
    // import.meta.env may be unavailable outside Vite
  }
  return 'node'
}

const driverCache = new Map<IsolateVM, IsolateDriver>()

export async function createIsolateDriver(
  vm: IsolateVM = getDefaultIsolateVM(),
): Promise<IsolateDriver> {
  const cached = driverCache.get(vm)
  if (cached) {
    console.info(
      `[createIsolateDriver] reusing cached driver for vm=${vm}`,
    )
    return cached
  }

  let driver: IsolateDriver
  let resolved: string

  switch (vm) {
    case 'quickjs': {
      const { createQuickJSIsolateDriver } =
        await import('@tanstack/ai-isolate-quickjs')
      driver = createQuickJSIsolateDriver()
      resolved = 'quickjs-wasm'
      break
    }
    case 'quickjs-bun': {
      // The native bun:ffi driver only loads under Bun. On a Node server (the
      // default `pnpm dev` workflow) fall back to the WASM QuickJS driver with
      // a warning instead of throwing an opaque createContext error, so the
      // sidebar option degrades gracefully rather than breaking the request.
      const isBun = typeof (globalThis as { Bun?: unknown }).Bun !== 'undefined'
      if (isBun) {
        const { createQuickJSBunIsolateDriver } =
          await import('@tanstack/ai-isolate-quickjs-bun')
        driver = createQuickJSBunIsolateDriver()
        resolved = 'quickjs-bun-native'
      } else {
        console.warn(
          '[createIsolateDriver] QuickJS Bun driver requires running the server under Bun; falling back to QuickJS (WASM).',
        )
        const { createQuickJSIsolateDriver } =
          await import('@tanstack/ai-isolate-quickjs')
        driver = createQuickJSIsolateDriver()
        resolved = 'quickjs-wasm-fallback (requested quickjs-bun, no global Bun)'
      }
      break
    }
    case 'cloudflare': {
      const { createCloudflareIsolateDriver } =
        await import('@tanstack/ai-isolate-cloudflare')
      driver = createCloudflareIsolateDriver({
        workerUrl: process.env.CLOUDFLARE_WORKER_URL || 'http://localhost:8787',
        authorization: process.env.CLOUDFLARE_WORKER_AUTH,
        timeout: 60000,
      })
      resolved = 'cloudflare'
      break
    }
    case 'node':
    default: {
      try {
        const { createNodeIsolateDriver } =
          await import('@tanstack/ai-isolate-node')
        driver = createNodeIsolateDriver()
        resolved = 'node-isolated-vm'
      } catch (err) {
        console.warn(
          `[createIsolateDriver] Node isolate driver unavailable, falling back to QuickJS: ${err instanceof Error ? err.message : String(err)}`,
        )
        const { createQuickJSIsolateDriver } =
          await import('@tanstack/ai-isolate-quickjs')
        driver = createQuickJSIsolateDriver()
        resolved = 'quickjs-wasm-fallback (node addon unavailable)'
      }
      break
    }
  }

  const runtime =
    typeof (globalThis as { Bun?: unknown }).Bun !== 'undefined' ? 'bun' : 'node'
  console.info(
    `[createIsolateDriver] vm=${vm} resolved=${resolved} serverRuntime=${runtime}`,
  )

  driverCache.set(vm, driver)
  return driver
}
