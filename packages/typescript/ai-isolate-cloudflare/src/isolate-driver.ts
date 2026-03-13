import type {
  ExecutionResult,
  IsolateConfig,
  IsolateContext,
  IsolateDriver,
  ToolBinding,
} from '@tanstack/ai-code-mode'
import type {
  ExecuteRequest,
  ExecuteResponse,
  ToolResultPayload,
  ToolSchema,
} from './types'

/**
 * Configuration for the Cloudflare Workers isolate driver
 */
export interface CloudflareIsolateDriverConfig {
  /**
   * URL of the deployed Cloudflare Worker
   * For local development, use: http://localhost:8787
   */
  workerUrl: string

  /**
   * Optional authorization header value
   * Useful for protecting your Worker endpoint
   */
  authorization?: string

  /**
   * Default execution timeout in ms (default: 30000)
   */
  timeout?: number

  /**
   * Maximum number of tool callback rounds (default: 10)
   * Prevents infinite loops
   */
  maxToolRounds?: number
}

/**
 * Convert tool bindings to schemas for the Worker
 */
function bindingsToSchemas(
  bindings: Record<string, ToolBinding>,
): Array<ToolSchema> {
  return Object.entries(bindings).map(([name, binding]) => ({
    name,
    description: binding.description,
    inputSchema: binding.inputSchema,
  }))
}

/**
 * Normalize errors from various sources
 */
function normalizeError(error: unknown): { name: string; message: string } {
  if (error instanceof Error) {
    return { name: error.name, message: error.message }
  }
  if (typeof error === 'object' && error !== null) {
    const e = error as Record<string, unknown>
    return {
      name: String(e.name || 'Error'),
      message: String(e.message || JSON.stringify(error)),
    }
  }
  return { name: 'Error', message: String(error) }
}

/**
 * IsolateContext implementation using Cloudflare Workers
 */
class CloudflareIsolateContext implements IsolateContext {
  private workerUrl: string
  private authorization?: string
  private timeout: number
  private maxToolRounds: number
  private bindings: Record<string, ToolBinding>
  private disposed = false

  constructor(
    workerUrl: string,
    bindings: Record<string, ToolBinding>,
    timeout: number,
    maxToolRounds: number,
    authorization?: string,
  ) {
    this.workerUrl = workerUrl
    this.bindings = bindings
    this.timeout = timeout
    this.maxToolRounds = maxToolRounds
    this.authorization = authorization
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

    const tools = bindingsToSchemas(this.bindings)
    let toolResults: Record<string, ToolResultPayload> | undefined
    let allLogs: Array<string> = []
    let rounds = 0

    // Request/response loop for tool callbacks
    while (rounds < this.maxToolRounds) {
      rounds++

      const request: ExecuteRequest = {
        code,
        tools,
        toolResults,
        timeout: this.timeout,
      }

      try {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        }

        if (this.authorization) {
          headers['Authorization'] = this.authorization
        }

        const response = await fetch(this.workerUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify(request),
        })

        if (!response.ok) {
          const errorText = await response.text()
          return {
            success: false,
            error: {
              name: 'WorkerError',
              message: `Worker returned ${response.status}: ${errorText}`,
            },
            logs: allLogs,
          }
        }

        const result: ExecuteResponse = await response.json()

        if (result.status === 'error') {
          return {
            success: false,
            error: result.error,
            logs: allLogs,
          }
        }

        if (result.status === 'done') {
          allLogs = [...allLogs, ...result.logs]
          return {
            success: result.success,
            value: result.value as T,
            error: result.error,
            logs: allLogs,
          }
        }

        // status === 'need_tools'
        // Collect logs from this round
        allLogs = [...allLogs, ...result.logs]

        // Execute tool calls locally
        toolResults = {}

        for (const toolCall of result.toolCalls) {
          const binding = this.bindings[toolCall.name] as
            | ToolBinding
            | undefined

          if (!binding) {
            toolResults[toolCall.id] = {
              success: false,
              error: `Unknown tool: ${toolCall.name}`,
            }
            continue
          }

          try {
            const toolResult = await binding.execute(toolCall.args)
            toolResults[toolCall.id] = {
              success: true,
              value: toolResult,
            }
          } catch (toolError) {
            const err = normalizeError(toolError)
            toolResults[toolCall.id] = {
              success: false,
              error: err.message,
            }
          }
        }

        // Continue loop to send results back to Worker
      } catch (fetchError) {
        const err = normalizeError(fetchError)
        return {
          success: false,
          error: {
            name: 'NetworkError',
            message: `Failed to communicate with Worker: ${err.message}`,
          },
          logs: allLogs,
        }
      }
    }

    // Max rounds exceeded
    return {
      success: false,
      error: {
        name: 'MaxRoundsExceeded',
        message: `Exceeded maximum tool callback rounds (${this.maxToolRounds})`,
      },
      logs: allLogs,
    }
  }

  dispose(): Promise<void> {
    this.disposed = true
    return Promise.resolve()
  }
}

/**
 * Create a Cloudflare Workers isolate driver
 *
 * This driver executes code on Cloudflare's global edge network,
 * providing true distributed execution capabilities.
 *
 * Tool calls are handled via a request/response loop:
 * 1. Code is sent to the Worker
 * 2. Worker executes until it needs a tool
 * 3. Tool call is returned to the driver
 * 4. Driver executes the tool locally
 * 5. Result is sent back to the Worker
 * 6. Worker continues execution
 *
 * @example
 * ```typescript
 * import { createCloudflareIsolateDriver } from '@tanstack/ai-isolate-cloudflare'
 *
 * // For local development with wrangler
 * const driver = createCloudflareIsolateDriver({
 *   workerUrl: 'http://localhost:8787',
 * })
 *
 * // For production
 * const driver = createCloudflareIsolateDriver({
 *   workerUrl: 'https://code-mode-worker.your-account.workers.dev',
 *   authorization: 'Bearer your-secret-token',
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
export function createCloudflareIsolateDriver(
  config: CloudflareIsolateDriverConfig,
): IsolateDriver {
  const {
    workerUrl,
    authorization,
    timeout: defaultTimeout = 30000,
    maxToolRounds = 10,
  } = config

  return {
    createContext(isolateConfig: IsolateConfig): Promise<IsolateContext> {
      const timeout = isolateConfig.timeout ?? defaultTimeout

      return Promise.resolve(
        new CloudflareIsolateContext(
          workerUrl,
          isolateConfig.bindings,
          timeout,
          maxToolRounds,
          authorization,
        ),
      )
    },
  }
}
