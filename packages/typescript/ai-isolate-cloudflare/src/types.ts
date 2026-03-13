/**
 * Shared types between the Cloudflare Worker and the driver
 */

/**
 * Tool schema passed to the worker
 */
export interface ToolSchema {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

/**
 * Request to execute code in the worker
 */
export interface ExecuteRequest {
  /** The code to execute */
  code: string
  /** Tool schemas available for the code to call */
  tools: Array<ToolSchema>
  /** Results from previous tool calls (for continuation) */
  toolResults?: Record<string, ToolResultPayload>
  /** Execution timeout in ms */
  timeout?: number
}

/**
 * Tool call requested by the worker
 */
export interface ToolCallRequest {
  /** Unique ID for this tool call */
  id: string
  /** Name of the tool to call */
  name: string
  /** Arguments to pass to the tool */
  args: unknown
}

/**
 * Result of a tool call
 */
export interface ToolResultPayload {
  /** Whether the tool call succeeded */
  success: boolean
  /** The result value if successful */
  value?: unknown
  /** Error message if failed */
  error?: string
}

/**
 * Response from the worker - either done or needs tool calls
 */
export type ExecuteResponse =
  | {
      status: 'done'
      success: boolean
      value?: unknown
      error?: {
        name: string
        message: string
        stack?: string
      }
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
