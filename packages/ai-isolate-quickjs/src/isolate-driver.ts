import {
  RELEASE_SYNC,
  getQuickJS,
  newQuickJSWASMModule,
  newVariant,
} from 'quickjs-emscripten'
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

export interface QuickJSIsolateDriverConfig {
  timeout?: number

  memoryLimit?: number

  maxStackSize?: number

  wasmLocation?: string
}

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

    const resolveWithPayload = (payloadJson: string) => {
      execState.pendingCancels.delete(cancel)
      const isIsolateDead = !vm.alive || !promise.alive
      if (isIsolateDead) return
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

    void promise.settled.then(() => {
      try {
        if (vm.runtime.alive) {
          const jobs = vm.runtime.executePendingJobs()
          if (jobs.error) {
            logs.push(
              `ERROR: uncaught error in sandboxed code: ${JSON.stringify(vm.dump(jobs.error))}`,
            )
            jobs.error.dispose()
          }
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

export function createQuickJSIsolateDriver(
  config: QuickJSIsolateDriverConfig = {},
): IsolateDriver {
  const defaultTimeout = config.timeout ?? 30000
  const defaultMemoryLimit = config.memoryLimit ?? DEFAULT_MEMORY_LIMIT_MB
  const defaultMaxStackSize =
    config.maxStackSize ?? DEFAULT_MAX_STACK_SIZE_BYTES
  let customQuickJSModule: ReturnType<typeof newQuickJSWASMModule> | undefined

  const loadQuickJS = () => {
    if (config.wasmLocation === undefined) {
      return getQuickJS()
    }

    customQuickJSModule ??= newQuickJSWASMModule(
      newVariant(RELEASE_SYNC, { wasmLocation: config.wasmLocation }),
    )
    return customQuickJSModule
  }

  return {
    async createContext(isolateConfig: IsolateConfig): Promise<IsolateContext> {
      const timeout = isolateConfig.timeout ?? defaultTimeout
      const memoryLimitMb = isolateConfig.memoryLimit ?? defaultMemoryLimit
      const maxStackSizeBytes = defaultMaxStackSize

      const QuickJS = await loadQuickJS()
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

      const execState: ExecState = {
        deadline: 0,
        pendingCancels: new Set<() => void>(),
      }

      const toolBindings = Object.entries(isolateConfig.bindings)
      for (const [name, binding] of toolBindings) {
        injectBinding(vm, name, binding, logs, execState)
      }

      vm.runtime.setInterruptHandler(() => Date.now() > execState.deadline)

      return new QuickJSIsolateContext(vm, logs, timeout, execState)
    },
  }
}
