import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
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
 * quickjs-bun's exports map only declares a `bun` condition (no import/default).
 * Bun's resolver understands that; Vite/Node package resolution does not —
 * even with `conditions: ['bun']` under Nitro's Vite module runner, which
 * still goes through resolvePackageEntry and fails with:
 *   "No known conditions for \".\" specifier in \"quickjs-bun\" package"
 *
 * Prefer Bun.resolveSync, then fall back to locating `index.ts` on disk so
 * tools that ignore the bun export condition can still load the entry.
 */
const QUICKJS_BUN_SPECIFIER = 'quickjs-bun'

type BunResolveSync = {
  resolveSync?: (specifier: string, from: string) => string
}

function moduleDir(): string {
  // import.meta.dirname is Node 20.11+ / Bun; fall back for older runtimes.
  if (typeof import.meta.dirname === 'string') return import.meta.dirname
  return dirname(fileURLToPath(import.meta.url))
}

function findQuickjsBunEntryOnDisk(): string | undefined {
  const starts = [moduleDir(), process.cwd()]
  for (const start of starts) {
    let dir = start
    for (let i = 0; i < 14; i++) {
      const candidate = join(dir, 'node_modules', 'quickjs-bun', 'index.ts')
      if (existsSync(candidate)) return candidate
      const parent = dirname(dir)
      if (parent === dir) break
      dir = parent
    }
  }
  return undefined
}

function resolveQuickjsBunEntry(): string {
  const bun = (globalThis as { Bun?: BunResolveSync }).Bun
  if (typeof bun?.resolveSync === 'function') {
    try {
      return bun.resolveSync(QUICKJS_BUN_SPECIFIER, moduleDir())
    } catch {
      // Fall through — e.g. package not visible from this module path.
    }
  }

  const onDisk = findQuickjsBunEntryOnDisk()
  if (onDisk !== undefined) return onDisk

  // Last resort: bare specifier (works only under a bun-aware resolver).
  return QUICKJS_BUN_SPECIFIER
}

/**
 * Runtime-native dynamic import that Vite/Nitro cannot rewrite into the
 * module runner. A plain `import()` in source is often transformed to
 * `runInlinedModule`, which then parses quickjs-bun as ESM and dies on
 * Bun-only syntax / strict-mode edge cases. Building the importer via
 * `Function` keeps a true host `import()` (Bun loads the .ts entry + bun:ffi).
 */
const nativeImport = new Function(
  'specifier',
  'return import(specifier)',
) as (specifier: string) => Promise<QuickJSBunModule>

/**
 * Dynamically import the `quickjs-bun` module namespace. Never a static import:
 * the package only resolves under Bun (or via the absolute-path fallbacks
 * above). Prefer an absolute file: URL so package.json `exports` (bun-only)
 * is never consulted by Node/Vite resolvers.
 */
function importQuickJSBun(): Promise<QuickJSBunModule> {
  const entry = resolveQuickjsBunEntry()
  const specifier =
    entry === QUICKJS_BUN_SPECIFIER || entry.startsWith('file:')
      ? entry
      : pathToFileURL(entry).href
  return nativeImport(specifier)
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
 * instead of WebAssembly. Each context gets its own QuickJS runtime with a
 * dedicated heap, stack limit, and interrupt-based timeout, so sandboxes are
 * isolated from each other at the language level and each enforces its own
 * resource limits.
 *
 * Note this is *not* an OS/VM sandbox: QuickJS is compiled by TinyCC and called
 * through `bun:ffi`, so it executes in the host process's address space. The
 * memory "limit" is QuickJS's internal accounting (`JS_SetMemoryLimit`), not a
 * hardware/OS boundary. For a stronger boundary use `@tanstack/ai-isolate-node`
 * (a separate V8 isolate) or the WASM driver (WebAssembly linear-memory
 * sandbox). It requires Bun >= 1.3.14 — on Node.js use
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
