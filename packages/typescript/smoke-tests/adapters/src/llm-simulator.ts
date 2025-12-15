import type {
  StreamChunk,
  ChatOptions,
  StructuredOutputOptions,
  StructuredOutputResult,
} from '@tanstack/ai'

/**
 * Defines a tool call in the simulator script
 */
export interface SimulatorToolCall {
  /** Tool name to call */
  name: string
  /** Arguments to pass to the tool (will be JSON stringified) */
  arguments: Record<string, any>
  /** Optional custom tool call ID (auto-generated if not provided) */
  id?: string
}

/**
 * Defines a single iteration (LLM turn) in the simulator script
 */
export interface SimulatorIteration {
  /** Text content to stream (optional) */
  content?: string
  /** Tool calls to make (optional) */
  toolCalls?: Array<SimulatorToolCall>
  /** Finish reason - defaults to 'stop' if no tool calls, 'tool_calls' if has tool calls */
  finishReason?: 'stop' | 'tool_calls' | 'length' | null
}

/**
 * Complete script defining the LLM behavior
 */
export interface SimulatorScript {
  /** Array of iterations (LLM turns) */
  iterations: Array<SimulatorIteration>
  /** Model name to report in chunks (default: 'simulator-model') */
  model?: string
}

/**
 * LLM Simulator Adapter
 *
 * A deterministic mock adapter that yields predictable responses
 * based on a pre-defined script. Useful for testing tool execution
 * flows without depending on actual LLM behavior.
 *
 * @example
 * ```typescript
 * const script: SimulatorScript = {
 *   iterations: [
 *     {
 *       content: "Let me check the temperature",
 *       toolCalls: [{ name: "get_temperature", arguments: { location: "Paris" } }]
 *     },
 *     {
 *       content: "The temperature in Paris is 70 degrees"
 *     }
 *   ]
 * }
 *
 * const adapter = createLLMSimulator(script)
 * const stream = chat({ adapter, model: 'simulator', messages, tools })
 * ```
 */
export class LLMSimulatorAdapter {
  readonly kind = 'text' as const
  readonly name = 'llm-simulator'
  readonly models = ['simulator-model'] as const

  private script: SimulatorScript
  private iterationIndex = 0
  private toolCallCounter = 0

  constructor(script: SimulatorScript) {
    this.script = script
  }

  /**
   * Reset the simulator to start from the first iteration
   */
  reset(): void {
    this.iterationIndex = 0
    this.toolCallCounter = 0
  }

  /**
   * Get the current iteration index
   */
  getCurrentIteration(): number {
    return this.iterationIndex
  }

  async *chatStream(
    options: ChatOptions<string, Record<string, unknown>>,
  ): AsyncIterable<StreamChunk> {
    // Determine iteration based on message history for stateless operation across requests.
    // This is primarily for E2E tests where each HTTP request creates a new adapter instance.
    //
    // Only apply message-based iteration when:
    // 1. We're at index 0 (fresh adapter instance)
    // 2. The script contains the tool calls we see in messages (full conversation script)
    //
    // For "continuation scripts" (unit tests) that only contain remaining iterations,
    // we rely on the stateful iterationIndex.
    if (this.iterationIndex === 0) {
      const iterationFromMessages = this.determineIterationFromMessages(
        options.messages,
      )
      if (iterationFromMessages !== null && iterationFromMessages > 0) {
        // Check if this script is a "full script" by seeing if iteration 0
        // has a tool call that matches one in the messages
        const firstIterationToolCalls = this.script.iterations[0]?.toolCalls
        const messagesHaveMatchingToolCall =
          firstIterationToolCalls?.some((tc) =>
            this.isToolCallInMessages(tc.name, options.messages),
          ) ?? false

        if (
          messagesHaveMatchingToolCall &&
          iterationFromMessages < this.script.iterations.length
        ) {
          // Full script mode: use message-based iteration
          this.iterationIndex = iterationFromMessages
        }
        // Otherwise: continuation script mode, keep iterationIndex at 0
      }
    }

    const iteration = this.script.iterations[this.iterationIndex]

    if (!iteration) {
      // No more iterations - just return done
      yield {
        type: 'done',
        id: this.generateId(),
        model: this.script.model || 'simulator-model',
        timestamp: Date.now(),
        finishReason: 'stop',
      }
      return
    }

    const baseId = this.generateId()
    const model = this.script.model || 'simulator-model'

    // Yield content chunks if content is provided
    if (iteration.content) {
      // Split content into chunks for more realistic streaming
      const words = iteration.content.split(' ')
      let accumulated = ''

      for (let i = 0; i < words.length; i++) {
        const word = words[i]
        const delta = i === 0 ? word : ` ${word}`
        accumulated += delta

        yield {
          type: 'content',
          id: baseId,
          model,
          timestamp: Date.now(),
          delta,
          content: accumulated,
          role: 'assistant',
        }
      }
    }

    // Yield tool call chunks if tool calls are provided
    if (iteration.toolCalls && iteration.toolCalls.length > 0) {
      for (let i = 0; i < iteration.toolCalls.length; i++) {
        const toolCall = iteration.toolCalls[i]!
        const toolCallId =
          toolCall.id || `call-${++this.toolCallCounter}-${Date.now()}`

        yield {
          type: 'tool_call',
          id: baseId,
          model,
          timestamp: Date.now(),
          toolCall: {
            id: toolCallId,
            type: 'function',
            function: {
              name: toolCall.name,
              arguments: JSON.stringify(toolCall.arguments),
            },
          },
          index: i,
        }
      }
    }

    // Determine finish reason
    let finishReason = iteration.finishReason
    if (finishReason === undefined) {
      finishReason =
        iteration.toolCalls && iteration.toolCalls.length > 0
          ? 'tool_calls'
          : 'stop'
    }

    // Yield done chunk
    yield {
      type: 'done',
      id: baseId,
      model,
      timestamp: Date.now(),
      finishReason,
      usage: {
        promptTokens: 10,
        completionTokens: 20,
        totalTokens: 30,
      },
    }

    // Advance to next iteration for next call
    this.iterationIndex++
  }

  async structuredOutput(
    _options: StructuredOutputOptions<Record<string, unknown>>,
  ): Promise<StructuredOutputResult<unknown>> {
    // Simple mock implementation
    return {
      data: {},
      rawText: '{}',
    }
  }

  private generateId(): string {
    return `sim-${Date.now()}-${Math.random().toString(36).substring(7)}`
  }

  /**
   * Check if a tool with the given name appears in the messages
   */
  private isToolCallInMessages(
    toolName: string,
    messages: Array<{
      role: string
      toolCalls?: Array<{ function: { name: string } }>
    }>,
  ): boolean {
    for (const msg of messages) {
      if (msg.role === 'assistant' && msg.toolCalls) {
        for (const tc of msg.toolCalls) {
          if (tc.function.name === toolName) {
            return true
          }
        }
      }
    }
    return false
  }

  /**
   * Determine which iteration we should be on based on message history.
   * This enables stateless operation across requests - each request can
   * determine the correct iteration based on how many tool call rounds
   * have been completed.
   *
   * Logic:
   * - Count assistant messages that have tool calls
   * - For each such message, check if there are corresponding tool results
   * - Tool results can be in:
   *   1. Separate `role: 'tool'` messages with `toolCallId`
   *   2. The `parts` array of assistant messages with `output` set
   * - Completed tool call rounds = iterations we've already processed
   */
  private determineIterationFromMessages(
    messages: Array<{
      role: string
      toolCalls?: Array<{
        id: string
        approval?: { id: string; approved: boolean }
      }>
      toolCallId?: string
      parts?: Array<{
        type: string
        id?: string
        output?: any
        approval?: { approved?: boolean }
      }>
    }>,
  ): number | null {
    if (!messages || messages.length === 0) {
      return 0 // Fresh conversation, start at iteration 0
    }

    // Find all assistant messages with tool calls
    const assistantToolCallMessages = messages.filter(
      (m) => m.role === 'assistant' && m.toolCalls && m.toolCalls.length > 0,
    )

    if (assistantToolCallMessages.length === 0) {
      // No tool calls in history, might be first iteration or continuation
      // Check if there's a user message (fresh start)
      const hasUserMessage = messages.some((m) => m.role === 'user')
      return hasUserMessage ? 0 : null
    }

    // Get all completed tool call IDs from:
    // 1. Separate tool result messages (role: 'tool')
    // 2. Parts array with output set (client tool results) - UIMessage format
    // 3. Parts array with approval.approved set (approval responses) - UIMessage format
    // 4. toolCalls array with approval.approved set (approval responses) - ModelMessage format
    const completedToolIds = new Set<string>()

    for (const msg of messages) {
      // Check for role: 'tool' messages (server tool results)
      if (msg.role === 'tool' && msg.toolCallId) {
        completedToolIds.add(msg.toolCallId)
      }

      // Check for UIMessage format: parts with output or approval responses
      if (msg.parts) {
        for (const part of msg.parts) {
          if (part.type === 'tool-call' && part.id) {
            // Client tool results have output set
            if (part.output !== undefined) {
              completedToolIds.add(part.id)
            }
            // Approval tools are complete when approval.approved is set (true or false)
            if (part.approval?.approved !== undefined) {
              completedToolIds.add(part.id)
            }
          }
        }
      }

      // Check for ModelMessage format: toolCalls with approval info
      if (msg.role === 'assistant' && msg.toolCalls) {
        for (const tc of msg.toolCalls) {
          // Approval tools are complete when approval.approved is set
          if (tc.approval?.approved !== undefined) {
            completedToolIds.add(tc.id)
          }
        }
      }
    }

    // Count how many complete tool call rounds we have
    let completedRounds = 0
    for (const assistantMsg of assistantToolCallMessages) {
      const toolCalls = assistantMsg.toolCalls as Array<{ id: string }>
      const allToolsComplete = toolCalls.every((tc) =>
        completedToolIds.has(tc.id),
      )
      if (allToolsComplete) {
        completedRounds++
      }
    }

    // The next iteration is completedRounds (0-indexed)
    // e.g., if we've completed 1 round, we're on iteration 1
    return completedRounds
  }
}

/**
 * Create a new LLM Simulator adapter with the given script
 */
export function createLLMSimulator(
  script: SimulatorScript,
): LLMSimulatorAdapter {
  return new LLMSimulatorAdapter(script)
}

// ============================================================================
// Pre-built Scripts for Common Scenarios
// ============================================================================

/**
 * Script builders for common test scenarios
 */
export const SimulatorScripts = {
  /**
   * Script for a single server tool call
   */
  singleServerTool(
    toolName: string,
    toolArgs: Record<string, any>,
    responseContent: string,
  ): SimulatorScript {
    return {
      iterations: [
        {
          content: `I'll use the ${toolName} tool.`,
          toolCalls: [{ name: toolName, arguments: toolArgs }],
        },
        {
          content: responseContent,
        },
      ],
    }
  },

  /**
   * Script for a single client tool call (no server execute)
   */
  singleClientTool(
    toolName: string,
    toolArgs: Record<string, any>,
    responseContent: string,
  ): SimulatorScript {
    return {
      iterations: [
        {
          content: `I'll use the ${toolName} tool.`,
          toolCalls: [{ name: toolName, arguments: toolArgs }],
        },
        {
          content: responseContent,
        },
      ],
    }
  },

  /**
   * Script for a tool that requires approval
   */
  approvalTool(
    toolName: string,
    toolArgs: Record<string, any>,
    responseAfterApproval: string,
  ): SimulatorScript {
    return {
      iterations: [
        {
          content: `I need to use ${toolName}, which requires your approval.`,
          toolCalls: [{ name: toolName, arguments: toolArgs }],
        },
        {
          content: responseAfterApproval,
        },
      ],
    }
  },

  /**
   * Script for sequential tool calls (tool A then tool B)
   */
  sequentialTools(
    tool1: { name: string; args: Record<string, any> },
    tool2: { name: string; args: Record<string, any> },
    finalResponse: string,
  ): SimulatorScript {
    return {
      iterations: [
        {
          content: `First, I'll use ${tool1.name}.`,
          toolCalls: [{ name: tool1.name, arguments: tool1.args }],
        },
        {
          content: `Now I'll use ${tool2.name}.`,
          toolCalls: [{ name: tool2.name, arguments: tool2.args }],
        },
        {
          content: finalResponse,
        },
      ],
    }
  },

  /**
   * Script for multiple tools in the same turn
   */
  parallelTools(
    tools: Array<{ name: string; args: Record<string, any> }>,
    responseContent: string,
  ): SimulatorScript {
    return {
      iterations: [
        {
          content: `I'll use multiple tools at once.`,
          toolCalls: tools.map((t) => ({ name: t.name, arguments: t.args })),
        },
        {
          content: responseContent,
        },
      ],
    }
  },

  /**
   * Script for a simple text response (no tools)
   */
  textOnly(content: string): SimulatorScript {
    return {
      iterations: [
        {
          content,
        },
      ],
    }
  },
}
