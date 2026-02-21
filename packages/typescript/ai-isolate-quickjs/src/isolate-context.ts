import { normalizeError } from './error-normalizer'
import { wrapCode } from './code-wrapper'
import type { QuickJSAsyncContext } from 'quickjs-emscripten'
import type { ExecutionResult, IsolateContext } from '@tanstack/ai-code-mode'

/**
 * IsolateContext implementation using QuickJS WASM
 */
export class QuickJSIsolateContext implements IsolateContext {
  private vm: QuickJSAsyncContext
  private logs: Array<string>
  private timeout: number
  private disposed = false

  constructor(vm: QuickJSAsyncContext, logs: Array<string>, timeout: number) {
    this.vm = vm
    this.logs = logs
    this.timeout = timeout
  }

  async execute<T = unknown>(code: string): Promise<ExecutionResult<T>> {
    if (this.disposed) {
      return {
        success: false,
        error: {
          name: 'DisposedError',
          message: 'Context has been disposed',
        },
        logs: [],
      }
    }

    // Clear previous logs
    this.logs.length = 0

    try {
      // Wrap user code in async IIFE
      const wrappedCode = wrapCode(code)

      // Set up timeout using interrupt handler
      const deadline = Date.now() + this.timeout
      this.vm.runtime.setInterruptHandler(() => {
        return Date.now() > deadline
      })

      // Evaluate async code
      const result = await this.vm.evalCodeAsync(wrappedCode)

      // Clear interrupt handler
      this.vm.runtime.setInterruptHandler(() => false)

      // Handle result using unwrapResult which throws on error
      let parsedResult: T
      try {
        const valueHandle = this.vm.unwrapResult(result)
        // Dump the result - for async code, this returns { type: 'fulfilled'|'rejected', value|error }
        const dumpedResult = this.vm.dump(valueHandle)

        // evalCodeAsync returns a promise result structure for async code
        // Check if it's a promise result and extract the actual value
        let actualValue: unknown
        if (
          typeof dumpedResult === 'object' &&
          dumpedResult !== null &&
          'type' in dumpedResult
        ) {
          const promiseResult = dumpedResult as {
            type: 'fulfilled' | 'rejected'
            value?: unknown
            error?: unknown
          }
          if (promiseResult.type === 'rejected') {
            return {
              success: false,
              error: normalizeError(promiseResult.error),
              logs: [...this.logs],
            }
          }
          actualValue = promiseResult.value
        } else {
          actualValue = dumpedResult
        }

        // Parse JSON if it's a string (from our serialization wrapper)
        if (typeof actualValue === 'string') {
          try {
            parsedResult = JSON.parse(actualValue) as T
          } catch {
            parsedResult = actualValue as T
          }
        } else {
          parsedResult = actualValue as T
        }

        return {
          success: true,
          value: parsedResult,
          logs: [...this.logs],
        }
      } catch (unwrapError) {
        // unwrapResult throws if there was an error
        return {
          success: false,
          error: normalizeError(unwrapError),
          logs: [...this.logs],
        }
      }
    } catch (error) {
      return {
        success: false,
        error: normalizeError(error),
        logs: [...this.logs],
      }
    }
  }

  dispose(): Promise<void> {
    if (!this.disposed) {
      this.disposed = true
      this.vm.dispose()
    }
    return Promise.resolve()
  }
}
