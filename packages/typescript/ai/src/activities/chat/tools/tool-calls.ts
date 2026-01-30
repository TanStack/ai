import { isStandardSchema, parseWithStandardSchema } from './schema-converter'
import type {
  ModelMessage,
  RunFinishedEvent,
  Tool,
  ToolCall,
  ToolCallArgsEvent,
  ToolCallEndEvent,
  ToolCallStartEvent,
} from '../../../types'

/**
 * Manages tool call accumulation and execution for the chat() method's automatic tool execution loop.
 *
 * Responsibilities:
 * - Accumulates streaming tool call events (ID, name, arguments)
 * - Validates tool calls (filters out incomplete ones)
 * - Executes tool `execute` functions with parsed arguments
 * - Emits `TOOL_CALL_END` events for client visibility
 * - Returns tool result messages for conversation history
 *
 * This class is used internally by the AI.chat() method to handle the automatic
 * tool execution loop. It can also be used independently for custom tool execution logic.
 *
 * @example
 * ```typescript
 * const manager = new ToolCallManager(tools);
 *
 * // During streaming, accumulate tool calls
 * for await (const chunk of stream) {
 *   if (chunk.type === 'TOOL_CALL_START') {
 *     manager.addToolCallStartEvent(chunk);
 *   } else if (chunk.type === 'TOOL_CALL_ARGS') {
 *     manager.addToolCallArgsEvent(chunk);
 *   }
 * }
 *
 * // After stream completes, execute tools
 * if (manager.hasToolCalls()) {
 *   const toolResults = yield* manager.executeTools(finishEvent);
 *   messages = [...messages, ...toolResults];
 *   manager.clear();
 * }
 * ```
 */
export class ToolCallManager {
  private toolCallsMap = new Map<number, ToolCall>()
  private tools: ReadonlyArray<Tool>

  constructor(tools: ReadonlyArray<Tool>) {
    this.tools = tools
  }

  /**
   * Add a TOOL_CALL_START event to begin tracking a tool call (AG-UI)
   */
  addToolCallStartEvent(event: ToolCallStartEvent): void {
    const index = event.index ?? this.toolCallsMap.size
    this.toolCallsMap.set(index, {
      id: event.toolCallId,
      type: 'function',
      function: {
        name: event.toolName,
        arguments: '',
      },
    })
  }

  /**
   * Add a TOOL_CALL_ARGS event to accumulate arguments (AG-UI)
   */
  addToolCallArgsEvent(event: ToolCallArgsEvent): void {
    // Find the tool call by ID
    for (const [, toolCall] of this.toolCallsMap.entries()) {
      if (toolCall.id === event.toolCallId) {
        toolCall.function.arguments += event.delta
        break
      }
    }
  }

  /**
   * Complete a tool call with its final input
   * Called when TOOL_CALL_END is received
   */
  completeToolCall(event: ToolCallEndEvent): void {
    for (const [, toolCall] of this.toolCallsMap.entries()) {
      if (toolCall.id === event.toolCallId) {
        if (event.input !== undefined) {
          toolCall.function.arguments = JSON.stringify(event.input)
        }
        break
      }
    }
  }

  /**
   * Check if there are any complete tool calls to execute
   */
  hasToolCalls(): boolean {
    return this.getToolCalls().length > 0
  }

  /**
   * Get all complete tool calls (filtered for valid ID and name)
   */
  getToolCalls(): Array<ToolCall> {
    return Array.from(this.toolCallsMap.values()).filter(
      (tc) => tc.id && tc.function.name && tc.function.name.trim().length > 0,
    )
  }

  /**
   * Execute all tool calls and return tool result messages
   * Yields TOOL_CALL_END events for streaming
   * @param finishEvent - RUN_FINISHED event from the stream
   */
  async *executeTools(
    finishEvent: RunFinishedEvent,
  ): AsyncGenerator<ToolCallEndEvent, Array<ModelMessage>, void> {
    const toolCallsArray = this.getToolCalls()
    const toolResults: Array<ModelMessage> = []

    for (const toolCall of toolCallsArray) {
      const tool = this.tools.find((t) => t.name === toolCall.function.name)

      let toolResultContent: string
      if (tool?.execute) {
        try {
          // Parse arguments
          let args: unknown
          try {
            args = JSON.parse(toolCall.function.arguments)
          } catch (parseError) {
            throw new Error(
              `Failed to parse tool arguments as JSON: ${toolCall.function.arguments}`,
            )
          }

          // Validate input against inputSchema (for Standard Schema compliant schemas)
          if (tool.inputSchema && isStandardSchema(tool.inputSchema)) {
            try {
              args = parseWithStandardSchema(tool.inputSchema, args)
            } catch (validationError: unknown) {
              const message =
                validationError instanceof Error
                  ? validationError.message
                  : 'Validation failed'
              throw new Error(
                `Input validation failed for tool ${tool.name}: ${message}`,
              )
            }
          }

          // Execute the tool
          let result = await tool.execute(args)

          // Validate output against outputSchema if provided (for Standard Schema compliant schemas)
          if (
            tool.outputSchema &&
            isStandardSchema(tool.outputSchema) &&
            result !== undefined &&
            result !== null
          ) {
            try {
              result = parseWithStandardSchema(tool.outputSchema, result)
            } catch (validationError: unknown) {
              const message =
                validationError instanceof Error
                  ? validationError.message
                  : 'Validation failed'
              throw new Error(
                `Output validation failed for tool ${tool.name}: ${message}`,
              )
            }
          }

          toolResultContent =
            typeof result === 'string' ? result : JSON.stringify(result)
        } catch (error: unknown) {
          // If tool execution fails, add error message
          const message =
            error instanceof Error ? error.message : 'Unknown error'
          toolResultContent = `Error executing tool: ${message}`
        }
      } else {
        // Tool doesn't have execute function, add placeholder
        toolResultContent = `Tool ${toolCall.function.name} does not have an execute function`
      }

      // Emit TOOL_CALL_END event
      yield {
        type: 'TOOL_CALL_END',
        toolCallId: toolCall.id,
        toolName: toolCall.function.name,
        model: finishEvent.model,
        timestamp: Date.now(),
        result: toolResultContent,
      }

      // Add tool result message
      toolResults.push({
        role: 'tool',
        content: toolResultContent,
        toolCallId: toolCall.id,
      })
    }

    return toolResults
  }

  /**
   * Clear the tool calls map for the next iteration
   */
  clear(): void {
    this.toolCallsMap.clear()
  }
}

export interface ToolResult {
  toolCallId: string
  toolName: string
  result: any
  state?: 'output-available' | 'output-error'
  /** Duration of tool execution in milliseconds (only for server-executed tools) */
  duration?: number
}

export interface ApprovalRequest {
  toolCallId: string
  toolName: string
  input: any
  approvalId: string
}

export interface ClientToolRequest {
  toolCallId: string
  toolName: string
  input: any
}

interface ExecuteToolCallsResult {
  /** Tool results ready to send to LLM */
  results: Array<ToolResult>
  /** Tools that need user approval before execution */
  needsApproval: Array<ApprovalRequest>
  /** Tools that need client-side execution */
  needsClientExecution: Array<ClientToolRequest>
}

/**
 * Execute tool calls based on their configuration
 *
 * Handles three cases:
 * 1. Client tools (no execute) - request client to execute
 * 2. Server tools with approval - check approval before executing
 * 3. Normal server tools - execute immediately
 *
 * @param toolCalls - Tool calls from the LLM
 * @param tools - Available tools with their configurations
 * @param approvals - Map of approval decisions (approval.id -> approved boolean)
 * @param clientResults - Map of client-side execution results (toolCallId -> result)
 */
export async function executeToolCalls(
  toolCalls: Array<ToolCall>,
  tools: ReadonlyArray<Tool>,
  approvals: Map<string, boolean> = new Map(),
  clientResults: Map<string, any> = new Map(),
): Promise<ExecuteToolCallsResult> {
  const results: Array<ToolResult> = []
  const needsApproval: Array<ApprovalRequest> = []
  const needsClientExecution: Array<ClientToolRequest> = []

  // Create tool lookup map
  const toolMap = new Map<string, Tool>()
  for (const tool of tools) {
    toolMap.set(tool.name, tool)
  }

  for (const toolCall of toolCalls) {
    const tool = toolMap.get(toolCall.function.name)
    const toolName = toolCall.function.name

    if (!tool) {
      // Unknown tool - return error
      results.push({
        toolCallId: toolCall.id,
        toolName,
        result: { error: `Unknown tool: ${toolName}` },
        state: 'output-error',
      })
      continue
    }

    // Parse arguments, throwing error if invalid JSON
    let input: unknown = {}
    const argsStr = toolCall.function.arguments.trim() || '{}'
    if (argsStr) {
      try {
        input = JSON.parse(argsStr)
      } catch (parseError) {
        // If parsing fails, throw error to fail fast
        throw new Error(`Failed to parse tool arguments as JSON: ${argsStr}`)
      }
    }

    // Validate input against inputSchema (for Standard Schema compliant schemas)
    if (tool.inputSchema && isStandardSchema(tool.inputSchema)) {
      try {
        input = parseWithStandardSchema(tool.inputSchema, input)
      } catch (validationError: unknown) {
        const message =
          validationError instanceof Error
            ? validationError.message
            : 'Validation failed'
        results.push({
          toolCallId: toolCall.id,
          toolName,
          result: {
            error: `Input validation failed for tool ${tool.name}: ${message}`,
          },
          state: 'output-error',
        })
        continue
      }
    }

    // CASE 1: Client-side tool (no execute function)
    if (!tool.execute) {
      // Check if tool needs approval
      if (tool.needsApproval) {
        const approvalId = `approval_${toolCall.id}`

        // Check if approval decision exists
        if (approvals.has(approvalId)) {
          const approved = approvals.get(approvalId)

          if (approved) {
            // Approved - check if client has executed
            if (clientResults.has(toolCall.id)) {
              results.push({
                toolCallId: toolCall.id,
                toolName,
                result: clientResults.get(toolCall.id),
              })
            } else {
              // Approved but not executed yet - request client execution
              needsClientExecution.push({
                toolCallId: toolCall.id,
                toolName,
                input,
              })
            }
          } else {
            // User declined
            results.push({
              toolCallId: toolCall.id,
              toolName,
              result: { error: 'User declined tool execution' },
              state: 'output-error',
            })
          }
        } else {
          // Need approval first
          needsApproval.push({
            toolCallId: toolCall.id,
            toolName: toolCall.function.name,
            input,
            approvalId,
          })
        }
      } else {
        // No approval needed - check if client has executed
        if (clientResults.has(toolCall.id)) {
          results.push({
            toolCallId: toolCall.id,
            toolName,
            result: clientResults.get(toolCall.id),
          })
        } else {
          // Request client execution
          needsClientExecution.push({
            toolCallId: toolCall.id,
            toolName,
            input,
          })
        }
      }
      continue
    }

    // CASE 2: Server tool with approval required
    if (tool.needsApproval) {
      const approvalId = `approval_${toolCall.id}`

      // Check if approval decision exists
      if (approvals.has(approvalId)) {
        const approved = approvals.get(approvalId)

        if (approved) {
          // Execute after approval
          const startTime = Date.now()
          try {
            let result = await tool.execute(input)
            const duration = Date.now() - startTime

            // Validate output against outputSchema if provided (for Standard Schema compliant schemas)
            if (
              tool.outputSchema &&
              isStandardSchema(tool.outputSchema) &&
              result !== undefined &&
              result !== null
            ) {
              result = parseWithStandardSchema(tool.outputSchema, result)
            }

            results.push({
              toolCallId: toolCall.id,
              toolName,
              result:
                typeof result === 'string'
                  ? JSON.parse(result)
                  : result || null,
              duration,
            })
          } catch (error: unknown) {
            const duration = Date.now() - startTime
            const message =
              error instanceof Error ? error.message : 'Unknown error'
            results.push({
              toolCallId: toolCall.id,
              toolName,
              result: { error: message },
              state: 'output-error',
              duration,
            })
          }
        } else {
          // User declined
          results.push({
            toolCallId: toolCall.id,
            toolName,
            result: { error: 'User declined tool execution' },
            state: 'output-error',
          })
        }
      } else {
        // Need approval
        needsApproval.push({
          toolCallId: toolCall.id,
          toolName,
          input,
          approvalId,
        })
      }
      continue
    }

    // CASE 3: Normal server tool - execute immediately
    const startTime = Date.now()
    try {
      let result = await tool.execute(input)
      const duration = Date.now() - startTime

      // Validate output against outputSchema if provided (for Standard Schema compliant schemas)
      if (
        tool.outputSchema &&
        isStandardSchema(tool.outputSchema) &&
        result !== undefined &&
        result !== null
      ) {
        result = parseWithStandardSchema(tool.outputSchema, result)
      }

      results.push({
        toolCallId: toolCall.id,
        toolName,
        result:
          typeof result === 'string' ? JSON.parse(result) : result || null,
        duration,
      })
    } catch (error: unknown) {
      const duration = Date.now() - startTime
      const message = error instanceof Error ? error.message : 'Unknown error'
      results.push({
        toolCallId: toolCall.id,
        toolName,
        result: { error: message },
        state: 'output-error',
        duration,
      })
    }
  }

  return { results, needsApproval, needsClientExecution }
}
