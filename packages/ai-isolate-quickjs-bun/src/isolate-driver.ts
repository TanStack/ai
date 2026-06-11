import {
  DEFAULT_MAX_TOOL_CALLS,
  QuickJSBunIsolateContext,
} from './isolate-context'
import type {
  IsolateConfig,
  IsolateContext,
  IsolateDriver,
} from '@tanstack/ai-code-mode'
import type { QuickJS } from 'quickjs-bun'
import type { QuickJSBunModule } from './isolate-context'

/** Default execution timeout in ms (matches the other isolate drivers). */
const DEFAULT_TIMEOUT_MS = 30000

/** Default memory limit in MB (matches the other isolate drivers). */
const DEFAULT_MEMORY_LIMIT_MB = 128

/** Default max stack size in bytes (matches the QuickJS WASM driver). */
const DEFAULT_MAX_STACK_SIZE_BYTES = 512 * 1024

/**
 * quickjs-bun's exports map only declares a `bun` condition, so build- and
 * test-time resolvers running on Node.js cannot resolve it. The non-literal
 * specifier keeps the import out of Vite's static analysis; it only ever
 * executes under the Bun runtime.
 */
const QUICKJS_BUN_SPECIFIER = 'quickjs-bun'

/**
 * Dynamically import the `quickjs-bun` module namespace. Kept as a function
 * (not a static import) because the package only resolves under the Bun
 * runtime; see `QUICKJS_BUN_SPECIFIER` for why the specifier is non-literal and
 * hidden from Vite's static analysis.
 */
function importQuickJSBun(): Promise<QuickJSBunModule> {
  return import(/* @vite-ignore */ QUICKJS_BUN_SPECIFIER)
}

let libraryPromise: Promise<QuickJS> | undefined

/**
 * Load the QuickJS library once per process, memoized in `libraryPromise`.
 * `quickjs-bun` compiles the vendored QuickJS C sources with Bun's embedded
 * TinyCC on first use (~100ms), after which creating a runtime + context costs
 * ~1-2ms. A failed load (e.g. a missing prebuilt library path on Windows) is
 * not cached, so a corrected environment can retry.
 */
async function loadQuickJSLibrary(): Promise<QuickJS> {
  libraryPromise ??= importQuickJSBun().then((mod) => new mod.QuickJS())
  try {
    return await libraryPromise
  } catch (error) {
    // Don't cache failures (e.g. a missing prebuilt library path on
    // Windows) so a corrected environment can retry.
    libraryPromise = undefined
    throw error
  }
}

/**
 * Configuration for the QuickJS Bun isolate driver
 */
export interface QuickJSBunIsolateDriverConfig {
  /**
   * Default execution timeout in ms (default: 30000)
   */
  timeout?: number

  /**
   * Default memory limit in MB (default: 128).
   * Applied via QuickJS `JS_SetMemoryLimit` on the per-context runtime.
   */
  memoryLimit?: number

  /**
   * Default max stack size in bytes (default: 512 KiB).
   * Applied via QuickJS `JS_SetMaxStackSize` on the per-context runtime.
   */
  maxStackSize?: number

  /**
   * Maximum number of host tool calls a single execution may make (default:
   * 1000). Bounds output and memory growth from untrusted sandbox code (e.g. a
   * `Promise.all` over a huge array); exceeding it throws a catchable error
   * inside the sandbox. The execution timeout still bounds wall-clock time.
   */
  maxToolCalls?: number
}

/**
 * Create a QuickJS isolate driver for the Bun runtime
 *
 * This driver runs QuickJS natively through `bun:ffi` (via `quickjs-bun`)
 * instead of WebAssembly. Each context gets its own QuickJS runtime with
 * dedicated memory and stack limits, so sandboxes are fully isolated from
 * each other and from the host. It requires Bun >= 1.3.14 — on Node.js use
 * `@tanstack/ai-isolate-node` or `@tanstack/ai-isolate-quickjs` instead.
 *
 * Tools are injected as async functions that bridge back to the host.
 *
 * @example
 * ```typescript
 * import { createQuickJSBunIsolateDriver } from '@tanstack/ai-isolate-quickjs-bun'
 *
 * const driver = createQuickJSBunIsolateDriver({
 *   timeout: 30000,
 * })
 *
 * const context = await driver.createContext({
 *   bindings: {
 *     readFile: {
 *       name: 'readFile',
 *       description: 'Read a file',
 *       inputSchema: { type: 'object', properties: { path: { type: 'string' } } },
 *       execute: async ({ path }) => fs.readFile(path, 'utf-8'),
 *     },
 *   },
 * })
 *
 * const result = await context.execute(`
 *   const content = await readFile({ path: './data.json' })
 *   return JSON.parse(content)
 * `)
 * ```
 */
export function createQuickJSBunIsolateDriver(
  config: QuickJSBunIsolateDriverConfig = {},
): IsolateDriver {
  const defaultTimeout = config.timeout ?? DEFAULT_TIMEOUT_MS
  const defaultMemoryLimit = config.memoryLimit ?? DEFAULT_MEMORY_LIMIT_MB
  const defaultMaxStackSize =
    config.maxStackSize ?? DEFAULT_MAX_STACK_SIZE_BYTES
  const maxToolCalls = config.maxToolCalls ?? DEFAULT_MAX_TOOL_CALLS

  return {
    /**
     * Create a fresh isolate context backed by its own QuickJS runtime +
     * context. Each context gets a dedicated runtime, so its memory/stack
     * limits and job queue are independent of every other context. Throws on
     * Node.js — this driver requires the Bun runtime.
     */
    async createContext(isolateConfig: IsolateConfig): Promise<IsolateContext> {
      if (typeof Bun === 'undefined') {
        throw new Error(
          '@tanstack/ai-isolate-quickjs-bun requires the Bun runtime (https://bun.sh). ' +
            'On Node.js, use @tanstack/ai-isolate-node or @tanstack/ai-isolate-quickjs instead.',
        )
      }

      const timeout = Math.max(1, isolateConfig.timeout ?? defaultTimeout)
      const memoryLimitMb = isolateConfig.memoryLimit ?? defaultMemoryLimit
      const maxStackSizeBytes = defaultMaxStackSize

      const quickjs = await importQuickJSBun()
      const library = await loadQuickJSLibrary()

      // A dedicated runtime per context gives every sandbox its own heap
      // and stack limits, mirroring `setMemoryLimit`/`setMaxStackSize` in
      // the QuickJS WASM driver.
      const runtime = new quickjs.JSRuntime({
        library,
        memoryBytes: memoryLimitMb * 1024 * 1024,
        stackBytes: maxStackSizeBytes,
      })

      try {
        const vm = runtime.createContext({ timeoutMs: timeout })
        return new QuickJSBunIsolateContext({
          quickjs,
          runtime,
          vm,
          timeout,
          maxToolCalls,
          bindings: isolateConfig.bindings,
        })
      } catch (error) {
        runtime.dispose()
        throw error
      }
    },
  }
}
