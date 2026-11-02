import { wrapCode } from '@tanstack/ai-code-mode'
import { normalizeError } from './error-normalizer'
import type ivm from 'isolated-vm'
import type { ExecutionResult, IsolateContext } from '@tanstack/ai-code-mode'

/**
 * IsolateContext implementation using isolated-vm
 */
export class NodeIsolateContext implements IsolateContext {
  private readonly isolate: ivm.Isolate
  private readonly context: ivm.Context
  private readonly logs: Array<string>
  private readonly timeout: number
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

  async execute<T = unknown>(
    code: string,
    options?: { signal?: AbortSignal },
  ): Promise<ExecutionResult<T>> {
    const signal = options?.signal
    if (signal?.aborted) return aborted(signal)
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

    // isolated-vm takes no signal. Disposing the isolate stops a running
    // script, so an abort ends this context.
    const onAbort = () => void this.dispose()
    signal?.addEventListener('abort', onAbort, { once: true })
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
      if (signal?.aborted) return aborted(signal, this.logs)
      return {
        success: false,
        error: normalizeError(error),
        logs: [...this.logs],
      }
    } finally {
      signal?.removeEventListener('abort', onAbort)
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

/** The result of a run stopped by its abort signal. */
function aborted<T>(
  signal: AbortSignal,
  logs: Array<string> = [],
): ExecutionResult<T> {
  const reason: unknown = signal.reason
  return {
    success: false,
    error: {
      name: 'AbortError',
      message:
        reason instanceof Error ? reason.message : 'Execution was aborted',
    },
    logs: [...logs],
  }
}
