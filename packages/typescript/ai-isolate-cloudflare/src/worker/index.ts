/**
 * Cloudflare Worker for Code Mode execution
 *
 * Executes JavaScript code in a fresh V8 isolate on Cloudflare's edge network
 * using the `worker_loader` (Dynamic Workers) binding. Tool calls round-trip
 * to the driver via the same request/response protocol as before.
 *
 * Flow:
 * 1. Receive code + tool schemas
 * 2. Wrap user code in an ES module exporting a `fetch` handler that returns
 *    the IIFE result as JSON
 * 3. Load the module into a child Worker via `env.LOADER.load(...)` and
 *    invoke its entrypoint
 * 4. If tool calls are needed, return them to the driver
 * 5. Driver executes tools locally, sends results back
 * 6. Re-execute with tool results injected
 * 7. Return final result
 *
 * `worker_loader` replaces the previous `unsafe_eval` binding, which is gated
 * by Cloudflare for all customer accounts and unusable in production. See
 * https://developers.cloudflare.com/dynamic-workers/ for the supported API.
 */

import { wrapCode } from './wrap-code'
import type { ExecuteRequest, ExecuteResponse, ToolCallRequest } from '../types'

/**
 * Compatibility date for the loaded child Worker. Pinned at this layer so
 * sandbox semantics don't drift with the parent Worker's compat date.
 */
const SANDBOX_COMPAT_DATE = '2026-05-01'

/**
 * Worker Loader binding type.
 *
 * Provides dynamic-code execution by loading a module into a fresh V8
 * isolate. Configure in wrangler.toml under `[[worker_loaders]]`. Requires a
 * Workers Paid plan; see https://developers.cloudflare.com/dynamic-workers/.
 */
interface WorkerLoaderEntrypoint {
  fetch: (request: Request) => Promise<Response>
}

interface LoadedWorker {
  getEntrypoint: (name?: string) => WorkerLoaderEntrypoint
}

interface WorkerLoader {
  load: (options: {
    compatibilityDate: string
    mainModule: string
    modules: Record<string, string>
    globalOutbound?: unknown
    env?: Record<string, unknown>
  }) => LoadedWorker
}

interface Env {
  /**
   * worker_loader (Dynamic Workers) binding. Configured in wrangler.toml
   * under `[[worker_loaders]] binding = "LOADER"`.
   */
  LOADER?: WorkerLoader
}

/**
 * Wrap the existing IIFE-returning string in an ES module that exposes a
 * `fetch` handler. The child Worker's entrypoint runs the IIFE on each
 * invocation and returns the structured result as JSON.
 */
function wrapAsSandboxModule(wrappedCode: string): string {
  return `
export default {
  async fetch() {
    const __result = await ${wrappedCode};
    return new Response(JSON.stringify(__result), {
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
`
}

/**
 * Execute code in a freshly loaded child Worker isolate.
 */
async function executeCode(
  request: ExecuteRequest,
  env: Env,
): Promise<ExecuteResponse> {
  const { code, tools, toolResults, timeout = 30000 } = request

  if (!env.LOADER) {
    return {
      status: 'error',
      error: {
        name: 'WorkerLoaderNotAvailable',
        message:
          'LOADER binding is not available. ' +
          'This Worker requires the worker_loader (Dynamic Workers) binding. ' +
          'Declare it in wrangler.toml under [[worker_loaders]] with ' +
          'binding = "LOADER" (Workers Paid plan required).',
      },
    }
  }

  try {
    const wrappedCode = wrapCode(code, tools, toolResults)
    const moduleSource = wrapAsSandboxModule(wrappedCode)

    let timeoutId: ReturnType<typeof setTimeout> | undefined
    const TIMEOUT_SENTINEL = '__SANDBOX_TIMEOUT__'
    const timeoutPromise = new Promise<never>((_resolve, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error(TIMEOUT_SENTINEL))
      }, timeout)
    })

    try {
      const loaded = env.LOADER.load({
        compatibilityDate: SANDBOX_COMPAT_DATE,
        mainModule: 'main.js',
        modules: { 'main.js': moduleSource },
        globalOutbound: null,
        env: {},
      })
      const entrypoint = loaded.getEntrypoint()
      const fetchPromise = entrypoint.fetch(
        new Request('https://sandbox.invalid/'),
      )
      const response = await Promise.race([fetchPromise, timeoutPromise])
      if (timeoutId) clearTimeout(timeoutId)

      const result: {
        status: string
        success?: boolean
        value?: unknown
        error?: { name: string; message: string; stack?: string }
        logs: Array<string>
        toolCalls?: Array<ToolCallRequest>
      } = await response.json()

      if (result.status === 'need_tools') {
        return {
          status: 'need_tools',
          toolCalls: result.toolCalls || [],
          logs: result.logs,
          continuationId: crypto.randomUUID(),
        }
      }

      return {
        status: 'done',
        success: result.success ?? false,
        value: result.value,
        error: result.error,
        logs: result.logs,
      }
    } catch (evalError: unknown) {
      if (timeoutId) clearTimeout(timeoutId)
      const error = evalError as Error

      if (error.message === TIMEOUT_SENTINEL) {
        return {
          status: 'error',
          error: {
            name: 'TimeoutError',
            message: `Execution timed out after ${timeout}ms`,
          },
        }
      }

      return {
        status: 'done',
        success: false,
        error: {
          name: error.name || 'EvalError',
          message: error.message || String(error),
          stack: error.stack,
        },
        logs: [],
      }
    }
  } catch (error: unknown) {
    const err = error as Error
    return {
      status: 'error',
      error: {
        name: err.name || 'Error',
        message: err.message || String(err),
      },
    }
  }
}

/**
 * Main Worker fetch handler
 */
export default {
  async fetch(
    request: Request,
    env: Env,
    _ctx: ExecutionContext,
  ): Promise<Response> {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
      })
    }

    // Only accept POST requests
    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      })
    }

    try {
      const body: ExecuteRequest = await request.json()

      // Validate request
      if (!body.code || typeof body.code !== 'string') {
        return new Response(JSON.stringify({ error: 'Code is required' }), {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        })
      }

      // Execute the code
      const result = await executeCode(body, env)

      return new Response(JSON.stringify(result), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      })
    } catch (error: unknown) {
      const err = error as Error
      return new Response(
        JSON.stringify({
          status: 'error',
          error: {
            name: 'RequestError',
            message: err.message || 'Failed to process request',
          },
        }),
        {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        },
      )
    }
  },
}
