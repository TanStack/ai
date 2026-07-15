import { getQuickJS } from 'quickjs-emscripten'
import { QuickJSIsolateContext } from './isolate-context'
import type {
  IsolateConfig,
  IsolateContext,
  IsolateDriver,
  ToolBinding,
} from '@tanstack/ai-code-mode'
import type { QuickJSContext } from 'quickjs-emscripten'

/** Default memory limit in MB (matches Node isolate driver default). */
const DEFAULT_MEMORY_LIMIT_MB = 128

/** Default max stack size in bytes for QuickJS runtime. */
const DEFAULT_MAX_STACK_SIZE_BYTES = 512 * 1024

/**
 * Configuration for the QuickJS WASM isolate driver
 */
export interface QuickJSIsolateDriverConfig {
  /**
   * Default execution timeout in ms (default: 30000)
   */
  timeout?: number

  /**
   * Default memory limit in MB (default: 128).
   * Applied via QuickJS `runtime.setMemoryLimit`.
   */
  memoryLimit?: number

  /**
   * Default max stack size in bytes (default: 512 KiB).
   * Applied via QuickJS `runtime.setMaxStackSize`.
   */
  maxStackSize?: number
}

async function invokeBinding(
  binding: ToolBinding,
  argsJson: string,
): Promise<string> {
  try {
    const value = await binding.execute(JSON.parse(argsJson))
    return JSON.stringify({ success: true, value })
  } catch (error) {
    return JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

function injectBinding(
  vm: QuickJSContext,
  context: QuickJSIsolateContext,
  name: string,
  binding: ToolBinding,
): void {
  const toolFn = vm.newFunction(name, (argsHandle) => {
    const argsJson = vm.getString(argsHandle)
    const deferred = vm.newPromise()
    const completeHostCall = context.beginHostCall()

    void invokeBinding(binding, argsJson).then((payloadJson) => {
      if (!vm.alive || !deferred.alive) {
        completeHostCall()
        return
      }

      const payloadHandle = vm.newString(payloadJson)
      deferred.resolve(payloadHandle)
      payloadHandle.dispose()

      void deferred.settled
        .then(() => {
          if (vm.runtime.alive) {
            context.runPendingJobs()
          }
        })
        .finally(completeHostCall)
    })

    return deferred.handle
  })

  vm.setProp(vm.global, `__${name}_impl`, toolFn)
  toolFn.dispose()

  const wrapperResult = vm.evalCode(`
    async function ${name}(input) {
      const resultJson = await __${name}_impl(JSON.stringify(input));
      const result = JSON.parse(resultJson);
      if (!result.success) {
        throw new Error(result.error);
      }
      return result.value;
    }
  `)
  if (wrapperResult.error) {
    const errorStr = vm.dump(wrapperResult.error)
    wrapperResult.error.dispose()
    throw new Error(`Failed to create wrapper for ${name}: ${errorStr}`)
  }
  wrapperResult.value.dispose()
}

/**
 * Create a QuickJS WASM isolate driver
 *
 * This driver uses QuickJS compiled to WebAssembly via Emscripten.
 * It provides a sandboxed JavaScript environment that runs anywhere
 * (Node.js, browser, edge) without native dependencies.
 *
 * Tools are injected as async functions that bridge back to the host.
 *
 * @example
 * ```typescript
 * import { createQuickJSIsolateDriver } from '@tanstack/ai-isolate-quickjs'
 *
 * const driver = createQuickJSIsolateDriver({
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
export function createQuickJSIsolateDriver(
  config: QuickJSIsolateDriverConfig = {},
): IsolateDriver {
  const defaultTimeout = config.timeout ?? 30000
  const defaultMemoryLimit = config.memoryLimit ?? DEFAULT_MEMORY_LIMIT_MB
  const defaultMaxStackSize =
    config.maxStackSize ?? DEFAULT_MAX_STACK_SIZE_BYTES

  return {
    async createContext(isolateConfig: IsolateConfig): Promise<IsolateContext> {
      const timeout = isolateConfig.timeout ?? defaultTimeout
      const memoryLimitMb = isolateConfig.memoryLimit ?? defaultMemoryLimit
      const maxStackSizeBytes = defaultMaxStackSize

      const QuickJS = await getQuickJS()
      const vm = QuickJS.newContext()

      // Enforce heap and stack limits so OOM/stack overflow surface as JS errors
      // instead of growing WASM memory until the host process OOMs.
      vm.runtime.setMemoryLimit(memoryLimitMb * 1024 * 1024)
      vm.runtime.setMaxStackSize(maxStackSizeBytes)

      // Set up console.log capture
      const logs: Array<string> = []

      // Create console object
      const consoleObj = vm.newObject()

      // Helper to create console methods
      const createConsoleMethod = (prefix: string) => {
        return vm.newFunction(`console.${prefix}`, (...args) => {
          const parts = args.map((arg) => {
            const str = vm.getString(arg)
            return str
          })
          const msg = prefix ? `${prefix}: ${parts.join(' ')}` : parts.join(' ')
          logs.push(msg)
        })
      }

      const logFn = createConsoleMethod('')
      const errorFn = createConsoleMethod('ERROR')
      const warnFn = createConsoleMethod('WARN')
      const infoFn = createConsoleMethod('INFO')

      vm.setProp(consoleObj, 'log', logFn)
      vm.setProp(consoleObj, 'error', errorFn)
      vm.setProp(consoleObj, 'warn', warnFn)
      vm.setProp(consoleObj, 'info', infoFn)
      vm.setProp(vm.global, 'console', consoleObj)

      // Dispose console handles
      logFn.dispose()
      errorFn.dispose()
      warnFn.dispose()
      infoFn.dispose()
      consoleObj.dispose()

      const context = new QuickJSIsolateContext(vm, logs, timeout)

      // Return native QuickJS promises from synchronous host functions so host
      // work does not suspend and resume the WASM stack through Asyncify.
      for (const [name, binding] of Object.entries(isolateConfig.bindings)) {
        injectBinding(vm, context, name, binding)
      }

      return context
    },
  }
}
