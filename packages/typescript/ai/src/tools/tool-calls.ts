import type {
  Tool,
  ToolCall,
  ModelMessage,
  DoneStreamChunk,
  ToolResultStreamChunk,
} from "../types";

/**
 * Manages tool call accumulation and execution for the chat() method's automatic tool execution loop.
 *
 * Responsibilities:
 * - Accumulates streaming tool call chunks (ID, name, arguments)
 * - Validates tool calls (filters out incomplete ones)
 * - Executes tool `execute` functions with parsed arguments
 * - Emits `tool_result` chunks for client visibility
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
 *   if (chunk.type === "tool_call") {
 *     manager.addToolCallChunk(chunk);
 *   }
 * }
 *
 * // After stream completes, execute tools
 * if (manager.hasToolCalls()) {
 *   const toolResults = yield* manager.executeTools(doneChunk);
 *   messages = [...messages, ...toolResults];
 *   manager.clear();
 * }
 * ```
 */
export class ToolCallManager {
  private toolCallsMap = new Map<number, ToolCall>();
  private tools: ReadonlyArray<Tool>;

  constructor(tools: ReadonlyArray<Tool>) {
    this.tools = tools;
  }

  /**
   * Add a tool call chunk to the accumulator
   * Handles streaming tool calls by accumulating arguments
   */
  addToolCallChunk(chunk: {
    toolCall: {
      id: string;
      type: "function";
      function: {
        name: string;
        arguments: string;
      };
    };
    index: number;
  }): void {
    const index = chunk.index ?? 0;
    const existing = this.toolCallsMap.get(index);

    if (!existing) {
      // Only create entry if we have a tool call ID and name
      if (chunk.toolCall.id && chunk.toolCall.function.name) {
        this.toolCallsMap.set(index, {
          id: chunk.toolCall.id,
          type: "function",
          function: {
            name: chunk.toolCall.function.name,
            arguments: chunk.toolCall.function.arguments || "",
          },
        });
      }
    } else {
      // Update name if it wasn't set before
      if (chunk.toolCall.function.name && !existing.function.name) {
        existing.function.name = chunk.toolCall.function.name;
      }
      // Accumulate arguments for streaming tool calls
      if (chunk.toolCall.function.arguments) {
        existing.function.arguments += chunk.toolCall.function.arguments;
      }
    }
  }

  /**
   * Check if there are any complete tool calls to execute
   */
  hasToolCalls(): boolean {
    return this.getToolCalls().length > 0;
  }

  /**
   * Get all complete tool calls (filtered for valid ID and name)
   */
  getToolCalls(): ToolCall[] {
    return Array.from(this.toolCallsMap.values()).filter(
      (tc) => tc.id && tc.function.name && tc.function.name.trim().length > 0
    );
  }

  /**
   * Execute all tool calls and return tool result messages
   * Also yields tool_result chunks for streaming
   */
  async *executeTools(
    doneChunk: DoneStreamChunk
  ): AsyncGenerator<ToolResultStreamChunk, ModelMessage[], void> {
    const toolCallsArray = this.getToolCalls();
    const toolResults: ModelMessage[] = [];

    for (const toolCall of toolCallsArray) {
      const tool = this.tools.find(
        (t) => t.function.name === toolCall.function.name
      );

      let toolResultContent: string;
      if (tool?.execute) {
        try {
          // Parse arguments
          let args: any;
          try {
            args = JSON.parse(toolCall.function.arguments);
          } catch (parseError) {
            throw new Error(
              `Failed to parse tool arguments as JSON: ${toolCall.function.arguments}`
            );
          }

          const result = await tool.execute(args);
          toolResultContent =
            typeof result === "string" ? result : JSON.stringify(result);
        } catch (error: any) {
          // If tool execution fails, add error message
          toolResultContent = `Error executing tool: ${error.message}`;
        }
      } else {
        // Tool doesn't have execute function, add placeholder
        toolResultContent = `Tool ${toolCall.function.name} does not have an execute function`;
      }

      // Emit tool_result chunk so callers can track tool execution
      yield {
        type: "tool_result",
        id: doneChunk.id,
        model: doneChunk.model,
        timestamp: Date.now(),
        toolCallId: toolCall.id,
        content: toolResultContent,
      };

      // Add tool result message
      toolResults.push({
        role: "tool",
        content: toolResultContent,
        toolCallId: toolCall.id,
      });
    }

    return toolResults;
  }

  /**
   * Clear the tool calls map for the next iteration
   */
  clear(): void {
    this.toolCallsMap.clear();
  }
}

export interface ToolResult {
  toolCallId: string;
  result: any;
  state?: "output-available" | "output-error";
}

export interface ApprovalRequest {
  toolCallId: string;
  toolName: string;
  input: any;
  approvalId: string;
}

export interface ClientToolRequest {
  toolCallId: string;
  toolName: string;
  input: any;
}

export interface ExecuteToolCallsResult {
  /** Tool results ready to send to LLM */
  results: ToolResult[];
  /** Tools that need user approval before execution */
  needsApproval: ApprovalRequest[];
  /** Tools that need client-side execution */
  needsClientExecution: ClientToolRequest[];
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
  toolCalls: ToolCall[],
  tools: ReadonlyArray<Tool>,
  approvals: Map<string, boolean> = new Map(),
  clientResults: Map<string, any> = new Map()
): Promise<ExecuteToolCallsResult> {
  const results: ToolResult[] = [];
  const needsApproval: ApprovalRequest[] = [];
  const needsClientExecution: ClientToolRequest[] = [];

  // Create tool lookup map
  const toolMap = new Map<string, Tool>();
  for (const tool of tools) {
    toolMap.set(tool.function.name, tool);
  }

  for (const toolCall of toolCalls) {
    const tool = toolMap.get(toolCall.function.name);

    if (!tool) {
      // Unknown tool - return error
      results.push({
        toolCallId: toolCall.id,
        result: { error: `Unknown tool: ${toolCall.function.name}` },
        state: "output-error",
      });
      continue;
    }

    // Parse arguments, throwing error if invalid JSON
    let input: any = {};
    const argsStr = toolCall.function.arguments?.trim() || "{}";
    if (argsStr) {
      try {
        input = JSON.parse(argsStr);
      } catch (parseError) {
        // If parsing fails, throw error to fail fast
        throw new Error(`Failed to parse tool arguments as JSON: ${argsStr}`);
      }
    }

    // CASE 1: Client-side tool (no execute function)
    if (!tool.execute) {
      // Check if tool needs approval
      if (tool.needsApproval) {
        const approvalId = `approval_${toolCall.id}`;

        // Check if approval decision exists
        if (approvals.has(approvalId)) {
          const approved = approvals.get(approvalId);

          if (approved) {
            // Approved - check if client has executed
            if (clientResults.has(toolCall.id)) {
              results.push({
                toolCallId: toolCall.id,
                result: clientResults.get(toolCall.id),
              });
            } else {
              // Approved but not executed yet - request client execution
              needsClientExecution.push({
                toolCallId: toolCall.id,
                toolName: toolCall.function.name,
                input,
              });
            }
          } else {
            // User declined
            results.push({
              toolCallId: toolCall.id,
              result: { error: "User declined tool execution" },
              state: "output-error",
            });
          }
        } else {
          // Need approval first
          needsApproval.push({
            toolCallId: toolCall.id,
            toolName: toolCall.function.name,
            input,
            approvalId,
          });
        }
      } else {
        // No approval needed - check if client has executed
        if (clientResults.has(toolCall.id)) {
          results.push({
            toolCallId: toolCall.id,
            result: clientResults.get(toolCall.id),
          });
        } else {
          // Request client execution
          needsClientExecution.push({
            toolCallId: toolCall.id,
            toolName: toolCall.function.name,
            input,
          });
        }
      }
      continue;
    }

    // CASE 2: Server tool with approval required
    if (tool.needsApproval) {
      const approvalId = `approval_${toolCall.id}`;

      // Check if approval decision exists
      if (approvals.has(approvalId)) {
        const approved = approvals.get(approvalId);

        if (approved) {
          // Execute after approval
          try {
            const result = await tool.execute(input);
            results.push({
              toolCallId: toolCall.id,
              result: result ? JSON.parse(result) : null,
            });
          } catch (error: any) {
            results.push({
              toolCallId: toolCall.id,
              result: { error: error.message },
              state: "output-error",
            });
          }
        } else {
          // User declined
          results.push({
            toolCallId: toolCall.id,
            result: { error: "User declined tool execution" },
            state: "output-error",
          });
        }
      } else {
        // Need approval
        needsApproval.push({
          toolCallId: toolCall.id,
          toolName: toolCall.function.name,
          input,
          approvalId,
        });
      }
      continue;
    }

    // CASE 3: Normal server tool - execute immediately
    try {
      const result = await tool.execute(input);
      results.push({
        toolCallId: toolCall.id,
        result: result ? JSON.parse(result) : null,
      });
    } catch (error: any) {
      results.push({
        toolCallId: toolCall.id,
        result: { error: error.message },
        state: "output-error",
      });
    }
  }

  return { results, needsApproval, needsClientExecution };
}
