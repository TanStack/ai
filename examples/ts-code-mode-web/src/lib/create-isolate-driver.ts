import type { IsolateDriver } from '@tanstack/ai-code-mode'

export type IsolateVM = 'node' | 'quickjs' | 'cloudflare'

const driverCache = new Map<IsolateVM, IsolateDriver>()

export async function createIsolateDriver(
  vm: IsolateVM = 'node',
): Promise<IsolateDriver> {
  const cached = driverCache.get(vm)
  if (cached) return cached

  let driver: IsolateDriver

  switch (vm) {
    case 'quickjs': {
      const { createQuickJSIsolateDriver } =
        await import('@tanstack/ai-isolate-quickjs')
      driver = createQuickJSIsolateDriver()
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
      break
    }
    case 'node':
    default: {
      try {
        const { createNodeIsolateDriver } =
          await import('@tanstack/ai-isolate-node')
        driver = createNodeIsolateDriver()
      } catch (err) {
        console.warn(
          `[createIsolateDriver] Node isolate driver unavailable, falling back to QuickJS: ${err instanceof Error ? err.message : String(err)}`,
        )
        const { createQuickJSIsolateDriver } =
          await import('@tanstack/ai-isolate-quickjs')
        driver = createQuickJSIsolateDriver()
      }
      break
    }
  }

  driverCache.set(vm, driver)
  return driver
}
