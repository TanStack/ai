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

const nativeImport = new Function('specifier', 'return import(specifier)') as (
  specifier: string,
) => Promise<QuickJSBunModule>

function importQuickJSBun(): Promise<QuickJSBunModule> {
  const entry = resolveQuickjsBunEntry()
  const specifier =
    entry === QUICKJS_BUN_SPECIFIER || entry.startsWith('file:')
      ? entry
      : pathToFileURL(entry).href
  return nativeImport(specifier)
}

let libraryPromise: Promise<QuickJS> | undefined

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

export interface QuickJSBunIsolateDriverConfig {
  timeout?: number

  memoryLimit?: number

  maxStackSize?: number

  maxToolCalls?: number
}

export function createQuickJSBunIsolateDriver(
  config: QuickJSBunIsolateDriverConfig = {},
): IsolateDriver {
  const defaultTimeout = config.timeout ?? DEFAULT_TIMEOUT_MS
  const defaultMemoryLimit = config.memoryLimit ?? DEFAULT_MEMORY_LIMIT_MB
  const defaultMaxStackSize =
    config.maxStackSize ?? DEFAULT_MAX_STACK_SIZE_BYTES
  const maxToolCalls = config.maxToolCalls ?? DEFAULT_MAX_TOOL_CALLS

  return {
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
