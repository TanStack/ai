/**
 * Structural Daytona process/code-run types plus the host/sandbox protocol.
 */

export interface DaytonaCodeRunArtifacts {
  stdout?: string | undefined
}

export interface DaytonaCodeRunResponse {
  exitCode?: number | undefined
  result?: string | undefined
  artifacts?: DaytonaCodeRunArtifacts | undefined
}

export interface DaytonaCodeRunParams {
  argv?: Array<string> | undefined
  env?: Record<string, string> | undefined
}

export interface DaytonaProcessLike {
  codeRun: (
    code: string,
    params?: DaytonaCodeRunParams,
    timeoutSeconds?: number,
  ) => Promise<DaytonaCodeRunResponse>
}

export interface DaytonaSandboxLike {
  process: DaytonaProcessLike
}

export interface ToolSchema {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

export interface ToolCallRequest {
  id: string
  name: string
  args: unknown
}

export type ToolResultPayload =
  | {
      success: true
      value?: unknown
      error?: never
    }
  | {
      success: false
      error: string
      value?: never
    }

export interface DaytonaExecutionError {
  name: string
  message: string
  stack?: string | undefined
}

export type DaytonaExecutionEnvelope =
  | {
      status: 'done'
      success: true
      value?: unknown
      error?: never
      logs: Array<string>
    }
  | {
      status: 'done'
      success: false
      error: DaytonaExecutionError
      value?: never
      logs: Array<string>
    }
  | {
      status: 'need_tools'
      toolCalls: Array<ToolCallRequest>
      logs: Array<string>
    }
  | {
      status: 'error'
      error: DaytonaExecutionError
    }
