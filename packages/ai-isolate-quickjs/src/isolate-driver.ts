import { newAsyncContext } from 'quickjs-emscripten'
import { QuickJSIsolateContext } from './isolate-context'
import type {
  IsolateConfig,
  IsolateContext,
  IsolateDriver,
} from '@tanstack/ai-code-mode'

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

      // Create async QuickJS context (supports async host functions)
      const vm = await newAsyncContext()

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

      // Inject each tool binding as an async function
      for (const [name, binding] of Object.entries(isolateConfig.bindings)) {
        // Create async function that calls back to host
        // newAsyncifiedFunction receives QuickJS handles as arguments
        const toolFn = vm.newAsyncifiedFunction(name, async (argsHandle) => {
          try {
            // Get the input argument - argsHandle is a QuickJS handle
            const argsJson = vm.getString(argsHandle)
            const args = JSON.parse(argsJson)

            // Execute the tool on the host
            const result = await binding.execute(args)

            // Return result as JSON string handle
            const returnHandle = vm.newString(
              JSON.stringify({ success: true, value: result }),
            )
            return returnHandle
          } catch (error) {
            const errorMessage =
              error instanceof Error ? error.message : String(error)
            const returnHandle = vm.newString(
              JSON.stringify({ success: false, error: errorMessage }),
            )
            return returnHandle
          }
        })

        // Set on global - the VM keeps its own reference
        vm.setProp(vm.global, `__${name}_impl`, toolFn)
        toolFn.dispose()

        // Create wrapper that parses input and output
        // Function names match the binding keys (e.g., external_fetchWeather)
        const wrapperCode = `
          async function ${name}(input) {
            const resultJson = await __${name}_impl(JSON.stringify(input));
            const result = JSON.parse(resultJson);
            if (!result.success) {
              throw new Error(result.error);
            }
            return result.value;
          }
        `
        const wrapperResult = vm.evalCode(wrapperCode)
        if (wrapperResult.error) {
          const errorStr = vm.dump(wrapperResult.error)
          wrapperResult.error.dispose()
          throw new Error(`Failed to create wrapper for ${name}: ${errorStr}`)
        }
        wrapperResult.value.dispose()
      }

      return new QuickJSIsolateContext(vm, logs, timeout)
    },
  }
}
