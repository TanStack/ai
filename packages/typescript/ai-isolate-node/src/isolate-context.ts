import { wrapCode } from '@tanstack/ai-code-mode'
import { normalizeError } from './error-normalizer'
import type ivm from 'isolated-vm'
import type { ExecutionResult, IsolateContext } from '@tanstack/ai-code-mode'

/**
 * IsolateContext implementation using isolated-vm
 */
export class NodeIsolateContext implements IsolateContext {
  private isolate: ivm.Isolate
  private context: ivm.Context
  private logs: Array<string>
  private timeout: number
  private disposed = false

  constructor(
    isolate: ivm.Isolate,
    context: ivm.Context,
    logs: Array<string>,
    timeout: number,
  ) {
    this.isolate = isolate
    this.context = context
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

      // Compile the script
      const script = await this.isolate.compileScript(wrappedCode)

      // Run with timeout
      const result = await script.run(this.context, {
        timeout: this.timeout,
        promise: true,
      })

      // Parse result if it's a JSON string (from our serialization)
      let parsedResult: T
      if (typeof result === 'string') {
        try {
          parsedResult = JSON.parse(result) as T
        } catch {
          parsedResult = result as T
        }
      } else {
        parsedResult = result as T
      }

      return {
        success: true,
        value: parsedResult,
        logs: [...this.logs],
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
      this.context.release()
      this.isolate.dispose()
    }
    return Promise.resolve()
  }
}
