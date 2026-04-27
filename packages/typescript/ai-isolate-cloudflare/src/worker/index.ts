/**
 * Cloudflare Worker for Code Mode execution
 *
 * This Worker executes JavaScript code in a V8 isolate on Cloudflare's edge network.
 * Tool calls are handled via a request/response loop with the driver.
 *
 * Flow:
 * 1. Receive code + tool schemas
 * 2. Execute code, collecting any tool calls
 * 3. If tool calls are needed, return them to the driver
 * 4. Driver executes tools locally, sends results back
 * 5. Re-execute with tool results injected
 * 6. Return final result
 */

import { wrapCode } from './wrap-code'
import type { ExecuteRequest, ExecuteResponse, ToolCallRequest } from '../types'

/**
 * UnsafeEval binding type.
 *
 * Provides dynamic-code execution against the Worker's V8 isolate. Available
 * locally (via wrangler dev) and in production deployments where the
 * `unsafe_eval` binding has been enabled on the Cloudflare account.
 */
interface UnsafeEval {
  eval: (code: string) => unknown
}

interface Env {
  /**
   * UnsafeEval binding. Configured in wrangler.toml as an unsafe binding.
   */
  UNSAFE_EVAL?: UnsafeEval
}

/**
 * Execute code in the Worker's V8 isolate
 */
async function executeCode(
  request: ExecuteRequest,
  env: Env,
): Promise<ExecuteResponse> {
  const { code, tools, toolResults, timeout = 30000 } = request

  // Check if UNSAFE_EVAL binding is available
  if (!env.UNSAFE_EVAL) {
    return {
      status: 'error',
      error: {
        name: 'UnsafeEvalNotAvailable',
        message:
          'UNSAFE_EVAL binding is not available. ' +
          'This Worker requires the unsafe_eval binding. ' +
          'Declare it in wrangler.toml under [[unsafe.bindings]] ' +
          '(works for local development and production where the ' +
          'account has unsafe_eval enabled).',
      },
    }
  }

  try {
    const wrappedCode = wrapCode(code, tools, toolResults)

    // Execute with timeout
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeout)

    try {
      // Execute the wrapped code through the UNSAFE_EVAL binding.
      const result = (await env.UNSAFE_EVAL.eval(wrappedCode)) as {
        status: string
        success?: boolean
        value?: unknown
        error?: { name: string; message: string; stack?: string }
        logs: Array<string>
        toolCalls?: Array<ToolCallRequest>
      }

      clearTimeout(timeoutId)

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
      clearTimeout(timeoutId)

      if (controller.signal.aborted) {
        return {
          status: 'error',
          error: {
            name: 'TimeoutError',
            message: `Execution timed out after ${timeout}ms`,
          },
        }
      }

      const error = evalError as Error
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
