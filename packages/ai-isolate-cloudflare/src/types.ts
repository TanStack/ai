export interface ToolSchema {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

export interface ExecuteRequest {
  /** The code to execute */
  code: string
  /** Tool schemas available for the code to call */
  tools: Array<ToolSchema>
  /** Results from previous tool calls (for continuation) */
  toolResults?: Record<string, ToolResultPayload> | undefined
  /** Execution timeout in ms */
  timeout?: number
}

export interface ToolCallRequest {
  /** Unique ID for this tool call */
  id: string
  /** Name of the tool to call */
  name: string
  /** Arguments to pass to the tool */
  args: unknown
}

export interface ToolResultPayload {
  /** Whether the tool call succeeded */
  success: boolean
  /** The result value if successful */
  value?: unknown
  /** Error message if failed */
  error?: string
}

export type ExecuteResponse =
  | {
      status: 'done'
      success: boolean
      value?: unknown
      error?:
        | {
            name: string
            message: string
            stack?: string | undefined
          }
        | undefined
      logs: Array<string>
    }
  | {
      status: 'need_tools'
      toolCalls: Array<ToolCallRequest>
      logs: Array<string>
      /** Continuation state to send back with tool results */
      continuationId: string
    }
  | {
      status: 'error'
      error: {
        name: string
        message: string
      }
    }
