import { getQuickJS } from 'quickjs-emscripten'
import { QuickJSIsolateContext } from './isolate-context'
import type { ExecState } from './isolate-context'
import type { QuickJSContext } from 'quickjs-emscripten'
import type {
  IsolateConfig,
  IsolateContext,
  IsolateDriver,
  ToolBinding,
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
 * Run a tool binding against JSON-encoded args. Never rejects: errors are
 * encoded into the JSON envelope so the guest-side wrapper can rethrow them.
 */
async function invokeBinding(
  binding: ToolBinding,
  argsJson: string,
): Promise<string> {
  try {
    const args = JSON.parse(argsJson)
    const result = await binding.execute(args)
    return JSON.stringify({ success: true, value: result })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    return JSON.stringify({ success: false, error: errorMessage })
  }
}

/**
 * Inject a tool binding as a host function that returns a QuickJS promise
 * resolved from the host side.
 *
 * Deliberately avoids `newAsyncifiedFunction`: repeated asyncify suspensions
 * corrupt QuickJS refcounts and abort the WASM module
 * (https://github.com/justjake/quickjs-emscripten/issues/258). The promise
 * bridge never suspends the WASM stack, so that bug cannot trigger.
 */
function injectBinding(
  vm: QuickJSContext,
  name: string,
  binding: ToolBinding,
  logs: Array<string>,
  execState: ExecState,
): void {
  const toolFn = vm.newFunction(name, (argsHandle) => {
    const argsJson = vm.getString(argsHandle)
    const promise = vm.newPromise()

    // A timed-out execution cancels every outstanding tool call by settling
    // its deferred with a timeout envelope, so the guest program itself can
    // settle and the VM can be disposed (freeing a runtime that still holds
    // an unsettled program promise aborts the shared WASM module).
    const resolveWithPayload = (payloadJson: string) => {
      execState.pendingCancels.delete(cancel)
      if (!vm.alive || !promise.alive) return
      const payloadHandle = vm.newString(payloadJson)
      promise.resolve(payloadHandle)
      payloadHandle.dispose()
    }
    const cancel = () =>
      resolveWithPayload(
        JSON.stringify({ success: false, error: 'Execution timed out' }),
      )
    execState.pendingCancels.add(cancel)

    void invokeBinding(binding, argsJson).then(resolveWithPayload)

    // Resume guest code waiting on the promise. Defense in depth: outside an
    // active execute() the interrupt deadline is 0, so a stray job from an
    // abandoned execution is interrupted instead of running unbounded.
    void promise.settled.then(() => {
      if (!vm.runtime.alive) return
      try {
        const jobs = vm.runtime.executePendingJobs()
        if (jobs.error) {
          // Errors thrown inside guest async code reject the observed program
          // promise instead of surfacing here; anything that does land here
          // would otherwise be silently swallowed and leak its handle.
          logs.push(
            `ERROR: uncaught error in sandboxed code: ${JSON.stringify(vm.dump(jobs.error))}`,
          )
          jobs.error.dispose()
        }
      } finally {
        promise.dispose()
      }
    })

    return promise.handle
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

      // Create a plain (non-asyncify) QuickJS context. Host async functions
      // are bridged with QuickJS promises instead of asyncify suspensions,
      // so the sync WASM build is sufficient and sidesteps asyncify bugs.
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

      // Shared between execute() and the tool bindings: the interrupt
      // deadline (0 means "no execution active" — any guest job that tries
      // to run outside execute() is interrupted immediately) and the cancel
      // callbacks for tool calls still awaiting their host promise.
      const execState: ExecState = {
        deadline: 0,
        pendingCancels: new Set<() => void>(),
      }

      // Inject each tool binding as an async function
      for (const [name, binding] of Object.entries(isolateConfig.bindings)) {
        injectBinding(vm, name, binding, logs, execState)
      }

      vm.runtime.setInterruptHandler(() => Date.now() > execState.deadline)

      return new QuickJSIsolateContext(vm, logs, timeout, execState)
    },
  }
}
