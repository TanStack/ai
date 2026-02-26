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

import type {
  ExecuteRequest,
  ExecuteResponse,
  ToolCallRequest,
  ToolResultPayload,
  ToolSchema,
} from '../types'

/**
 * UnsafeEval binding type
 * This is only available in local development with wrangler dev
 */
interface UnsafeEval {
  eval: (code: string) => unknown
}

interface Env {
  /**
   * UnsafeEval binding - provides eval() for local development
   * Configured in wrangler.toml as an unsafe binding
   */
  UNSAFE_EVAL?: UnsafeEval
}

/**
 * Generate tool wrapper code that collects calls or returns cached results
 * Function names match the binding keys (e.g., external_fetchWeather)
 */
function generateToolWrappers(
  tools: Array<ToolSchema>,
  toolResults?: Record<string, ToolResultPayload>,
): string {
  const wrappers: Array<string> = []

  for (const tool of tools) {
    if (toolResults) {
      // We have results - create functions that return cached results
      wrappers.push(`
        async function ${tool.name}(input) {
          const callId = '${tool.name}_' + JSON.stringify(input);
          const result = __toolResults[callId];
          if (!result) {
            throw new Error('Tool result not found for: ' + callId);
          }
          if (!result.success) {
            throw new Error(result.error || 'Tool call failed');
          }
          return result.value;
        }
      `)
    } else {
      // First pass - collect tool calls
      wrappers.push(`
        async function ${tool.name}(input) {
          const callId = '${tool.name}_' + JSON.stringify(input);
          __pendingToolCalls.push({
            id: callId,
            name: '${tool.name}',
            args: input
          });
          // Throw a special error to halt execution
          throw new __ToolCallNeeded(callId);
        }
      `)
    }
  }

  return wrappers.join('\n')
}

/**
 * Wrap user code in an async IIFE with tool wrappers
 */
function wrapCode(
  code: string,
  tools: Array<ToolSchema>,
  toolResults?: Record<string, ToolResultPayload>,
): string {
  const toolWrappers = generateToolWrappers(tools, toolResults)
  const toolResultsJson = toolResults ? JSON.stringify(toolResults) : '{}'

  return `
    (async function() {
      // Tool call tracking
      const __pendingToolCalls = [];
      const __toolResults = ${toolResultsJson};
      const __logs = [];

      // Special error class for tool calls
      class __ToolCallNeeded extends Error {
        constructor(callId) {
          super('Tool call needed: ' + callId);
          this.callId = callId;
        }
      }

      // Console capture
      const console = {
        log: (...args) => __logs.push(args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')),
        error: (...args) => __logs.push('ERROR: ' + args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')),
        warn: (...args) => __logs.push('WARN: ' + args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')),
        info: (...args) => __logs.push('INFO: ' + args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')),
      };

      // Tool wrappers
      ${toolWrappers}

      try {
        // Execute user code
        const __userResult = await (async function() {
          ${code}
        })();

        return {
          status: 'done',
          success: true,
          value: __userResult,
          logs: __logs
        };
      } catch (__error) {
        if (__error instanceof __ToolCallNeeded) {
          // Tool calls needed - return pending calls
          return {
            status: 'need_tools',
            toolCalls: __pendingToolCalls,
            logs: __logs
          };
        }

        // Regular error
        return {
          status: 'done',
          success: false,
          error: {
            name: __error.name || 'Error',
            message: __error.message || String(__error),
            stack: __error.stack
          },
          logs: __logs
        };
      }
    })()
  `
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
          'This Worker requires the unsafe_eval binding for local development. ' +
          'For production, consider using Workers for Platforms.',
      },
    }
  }

  try {
    const wrappedCode = wrapCode(code, tools, toolResults)

    // Execute with timeout
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeout)

    try {
      // Use UNSAFE_EVAL binding to execute the code
      // This is only available in local development with wrangler dev
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
