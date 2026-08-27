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

export interface CloudflareIsolateDriverConfig {
  workerUrl: string

  authorization?: string

  timeout?: number

  maxToolRounds?: number
}

function bindingsToSchemas(
  bindings: Record<string, ToolBinding>,
): Array<ToolSchema> {
  return Object.entries(bindings).map(([name, binding]) => ({
    name,
    description: binding.description,
    inputSchema: binding.inputSchema,
  }))
}

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

class CloudflareIsolateContext implements IsolateContext {
  private readonly workerUrl: string
  private readonly authorization?: string
  private readonly timeout: number
  private readonly maxToolRounds: number
  private readonly bindings: Record<string, ToolBinding>
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
          const resultError = result.error
          return {
            success: result.success,
            value: result.value as T,
            ...(resultError !== undefined
              ? {
                  error: {
                    name: resultError.name,
                    message: resultError.message,
                    ...(resultError.stack !== undefined
                      ? { stack: resultError.stack }
                      : {}),
                  },
                }
              : {}),
            logs: allLogs,
          }
        }

        // status === 'need_tools'
        // Collect logs from this round
        allLogs = [...allLogs, ...result.logs]

        toolResults = { ...(toolResults ?? {}) }

        for (const toolCall of result.toolCalls) {
          const binding = this.bindings[toolCall.name]

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
