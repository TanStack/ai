import type { Tool, ToolCall } from "../types";

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
        throw new Error(
          `Failed to parse tool arguments as JSON: ${argsStr}`
        );
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

