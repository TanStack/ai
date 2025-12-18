/**
 * Agent Loop
 *
 * Orchestrates agentic text generation by wrapping a text creator function
 * and handling automatic tool execution and looping.
 */

import { aiEventClient } from '../event-client.js'
import { ToolCallManager, executeToolCalls } from '../activities/chat/tools/tool-calls'
import { maxIterations as maxIterationsStrategy } from '../activities/chat/agent-loop-strategies'
import type {
  ApprovalRequest,
  ClientToolRequest,
  ToolResult,
} from '../activities/chat/tools/tool-calls'
import type { z } from 'zod'
import type {
  AgentLoopStrategy,
  DoneStreamChunk,
  ModelMessage,
  StreamChunk,
  Tool,
  ToolCall,
} from '../types'

// ===========================
// Types
// ===========================

/**
 * Options passed to the text creator function.
 * The creator function should spread these into its text() call.
 */
export interface TextCreatorOptions {
  /** Conversation messages (updated each iteration with tool results) */
  messages: Array<ModelMessage>
  /** Tools for function calling */
  tools?: ReadonlyArray<Tool>
  /** System prompts */
  systemPrompts?: Array<string>
  /** AbortController for cancellation */
  abortController?: AbortController
  /** Zod schema for structured output (when provided, returns Promise instead of stream) */
  outputSchema?: z.ZodType
}

/**
 * A function that creates a text stream or structured output.
 * This is typically a partial application of the text() function with adapter and model pre-configured.
 *
 * @example
 * ```ts
 * const textFn: TextCreator = (opts) => text({
 *   adapter: openaiText(),
 *   model: 'gpt-4o',
 *   ...opts
 * })
 * ```
 */
export type TextCreator = <TSchema extends z.ZodType | undefined = undefined>(
  options: TextCreatorOptions & { outputSchema?: TSchema },
) => TSchema extends z.ZodType
  ? Promise<z.infer<TSchema>>
  : AsyncIterable<StreamChunk>

/**
 * Base options for the agent loop.
 */
export interface AgentLoopBaseOptions {
  /** Conversation messages */
  messages: Array<ModelMessage>
  /** System prompts to prepend to the conversation */
  systemPrompts?: Array<string>
  /** Tools for function calling (auto-executed when called) */
  tools?: ReadonlyArray<Tool>
  /** AbortController for cancellation */
  abortController?: AbortController
  /** Strategy for controlling the agent loop */
  agentLoopStrategy?: AgentLoopStrategy
  /** Unique conversation identifier for tracking */
  conversationId?: string
}

/**
 * Options for streaming agent loop (no structured output).
 */
export interface AgentLoopStreamOptions extends AgentLoopBaseOptions {
  outputSchema?: undefined
}

/**
 * Options for structured output agent loop.
 */
export interface AgentLoopStructuredOptions<TSchema extends z.ZodType>
  extends AgentLoopBaseOptions {
  /** Zod schema for structured output - determines return type */
  outputSchema: TSchema
}

/**
 * Combined options type for the agent loop.
 */
export type AgentLoopOptions<TSchema extends z.ZodType | undefined = undefined> =
  TSchema extends z.ZodType
    ? AgentLoopStructuredOptions<TSchema>
    : AgentLoopStreamOptions

// ===========================
// Agent Loop Engine
// ===========================

interface AgentLoopEngineConfig {
  textFn: TextCreator
  options: AgentLoopBaseOptions
}

type ToolPhaseResult = 'continue' | 'stop' | 'wait'
type CyclePhase = 'processText' | 'executeToolCalls'

class AgentLoopEngine {
  private readonly textFn: TextCreator
  private readonly options: AgentLoopBaseOptions
  private readonly tools: ReadonlyArray<Tool>
  private readonly loopStrategy: AgentLoopStrategy
  private readonly toolCallManager: ToolCallManager
  private readonly initialMessageCount: number
  private readonly requestId: string
  private readonly streamId: string
  private readonly effectiveSignal?: AbortSignal

  private messages: Array<ModelMessage>
  private iterationCount = 0
  private lastFinishReason: string | null = null
  private streamStartTime = 0
  private totalChunkCount = 0
  private currentMessageId: string | null = null
  private accumulatedContent = ''
  private doneChunk: DoneStreamChunk | null = null
  private shouldEmitStreamEnd = true
  private earlyTermination = false
  private toolPhase: ToolPhaseResult = 'continue'
  private cyclePhase: CyclePhase = 'processText'

  constructor(config: AgentLoopEngineConfig) {
    this.textFn = config.textFn
    this.options = config.options
    this.tools = config.options.tools || []
    this.loopStrategy =
      config.options.agentLoopStrategy || maxIterationsStrategy(5)
    this.toolCallManager = new ToolCallManager(this.tools)
    this.initialMessageCount = config.options.messages.length
    this.messages = [...config.options.messages]
    this.requestId = this.createId('agent')
    this.streamId = this.createId('stream')
    this.effectiveSignal = config.options.abortController?.signal
  }

  /** Get the accumulated content after the loop completes */
  getAccumulatedContent(): string {
    return this.accumulatedContent
  }

  /** Get the final messages array after the loop completes */
  getMessages(): Array<ModelMessage> {
    return this.messages
  }

  async *run(): AsyncGenerator<StreamChunk> {
    this.beforeRun()

    try {
      const pendingPhase = yield* this.checkForPendingToolCalls()
      if (pendingPhase === 'wait') {
        return
      }

      do {
        if (this.earlyTermination || this.isAborted()) {
          return
        }

        this.beginCycle()

        if (this.cyclePhase === 'processText') {
          yield* this.streamTextResponse()
        } else {
          yield* this.processToolCalls()
        }

        this.endCycle()
      } while (this.shouldContinue())
    } finally {
      this.afterRun()
    }
  }

  private beforeRun(): void {
    this.streamStartTime = Date.now()

    aiEventClient.emit('text:started', {
      requestId: this.requestId,
      streamId: this.streamId,
      model: 'agent-loop',
      provider: 'agent',
      messageCount: this.initialMessageCount,
      hasTools: this.tools.length > 0,
      streaming: true,
      timestamp: Date.now(),
      clientId: this.options.conversationId,
      toolNames: this.tools.map((t) => t.name),
    })

    aiEventClient.emit('stream:started', {
      streamId: this.streamId,
      model: 'agent-loop',
      provider: 'agent',
      timestamp: Date.now(),
    })
  }

  private afterRun(): void {
    if (!this.shouldEmitStreamEnd) {
      return
    }

    const now = Date.now()

    aiEventClient.emit('text:completed', {
      requestId: this.requestId,
      streamId: this.streamId,
      model: 'agent-loop',
      content: this.accumulatedContent,
      messageId: this.currentMessageId || undefined,
      finishReason: this.lastFinishReason || undefined,
      usage: this.doneChunk?.usage,
      timestamp: now,
    })

    aiEventClient.emit('stream:ended', {
      requestId: this.requestId,
      streamId: this.streamId,
      totalChunks: this.totalChunkCount,
      duration: now - this.streamStartTime,
      timestamp: now,
    })
  }

  private beginCycle(): void {
    if (this.cyclePhase === 'processText') {
      this.beginIteration()
    }
  }

  private endCycle(): void {
    if (this.cyclePhase === 'processText') {
      this.cyclePhase = 'executeToolCalls'
      return
    }

    this.cyclePhase = 'processText'
    this.iterationCount++
  }

  private beginIteration(): void {
    this.currentMessageId = this.createId('msg')
    this.accumulatedContent = ''
    this.doneChunk = null
  }

  private async *streamTextResponse(): AsyncGenerator<StreamChunk> {
    // Call the user-provided text function with current state (no outputSchema for streaming)
    const stream = this.textFn({
      messages: this.messages,
      tools: this.tools,
      systemPrompts: this.options.systemPrompts,
      abortController: this.options.abortController,
    }) as AsyncIterable<StreamChunk>

    for await (const chunk of stream) {
      if (this.isAborted()) {
        break
      }

      this.totalChunkCount++

      yield chunk
      this.handleStreamChunk(chunk)

      if (this.earlyTermination) {
        break
      }
    }
  }

  private handleStreamChunk(chunk: StreamChunk): void {
    switch (chunk.type) {
      case 'content':
        this.handleContentChunk(chunk)
        break
      case 'tool_call':
        this.handleToolCallChunk(chunk)
        break
      case 'tool_result':
        this.handleToolResultChunk(chunk)
        break
      case 'done':
        this.handleDoneChunk(chunk)
        break
      case 'error':
        this.handleErrorChunk(chunk)
        break
      case 'thinking':
        this.handleThinkingChunk(chunk)
        break
      default:
        break
    }
  }

  private handleContentChunk(chunk: Extract<StreamChunk, { type: 'content' }>) {
    this.accumulatedContent = chunk.content
    aiEventClient.emit('stream:chunk:content', {
      streamId: this.streamId,
      messageId: this.currentMessageId || undefined,
      content: chunk.content,
      delta: chunk.delta,
      timestamp: Date.now(),
    })
  }

  private handleToolCallChunk(
    chunk: Extract<StreamChunk, { type: 'tool_call' }>,
  ): void {
    this.toolCallManager.addToolCallChunk(chunk)
    aiEventClient.emit('stream:chunk:tool-call', {
      streamId: this.streamId,
      messageId: this.currentMessageId || undefined,
      toolCallId: chunk.toolCall.id,
      toolName: chunk.toolCall.function.name,
      index: chunk.index,
      arguments: chunk.toolCall.function.arguments,
      timestamp: Date.now(),
    })
  }

  private handleToolResultChunk(
    chunk: Extract<StreamChunk, { type: 'tool_result' }>,
  ): void {
    aiEventClient.emit('stream:chunk:tool-result', {
      streamId: this.streamId,
      messageId: this.currentMessageId || undefined,
      toolCallId: chunk.toolCallId,
      result: chunk.content,
      timestamp: Date.now(),
    })
  }

  private handleDoneChunk(chunk: DoneStreamChunk): void {
    // Don't overwrite a tool_calls finishReason with a stop finishReason
    if (
      this.doneChunk?.finishReason === 'tool_calls' &&
      chunk.finishReason === 'stop'
    ) {
      this.lastFinishReason = chunk.finishReason
      aiEventClient.emit('stream:chunk:done', {
        streamId: this.streamId,
        messageId: this.currentMessageId || undefined,
        finishReason: chunk.finishReason,
        usage: chunk.usage,
        timestamp: Date.now(),
      })

      if (chunk.usage) {
        aiEventClient.emit('usage:tokens', {
          requestId: this.requestId,
          streamId: this.streamId,
          messageId: this.currentMessageId || undefined,
          model: 'agent-loop',
          usage: chunk.usage,
          timestamp: Date.now(),
        })
      }
      return
    }

    this.doneChunk = chunk
    this.lastFinishReason = chunk.finishReason
    aiEventClient.emit('stream:chunk:done', {
      streamId: this.streamId,
      messageId: this.currentMessageId || undefined,
      finishReason: chunk.finishReason,
      usage: chunk.usage,
      timestamp: Date.now(),
    })

    if (chunk.usage) {
      aiEventClient.emit('usage:tokens', {
        requestId: this.requestId,
        streamId: this.streamId,
        messageId: this.currentMessageId || undefined,
        model: 'agent-loop',
        usage: chunk.usage,
        timestamp: Date.now(),
      })
    }
  }

  private handleErrorChunk(
    chunk: Extract<StreamChunk, { type: 'error' }>,
  ): void {
    aiEventClient.emit('stream:chunk:error', {
      streamId: this.streamId,
      messageId: this.currentMessageId || undefined,
      error: chunk.error.message,
      timestamp: Date.now(),
    })
    this.earlyTermination = true
    this.shouldEmitStreamEnd = false
  }

  private handleThinkingChunk(
    chunk: Extract<StreamChunk, { type: 'thinking' }>,
  ): void {
    aiEventClient.emit('stream:chunk:thinking', {
      streamId: this.streamId,
      messageId: this.currentMessageId || undefined,
      content: chunk.content,
      delta: chunk.delta,
      timestamp: Date.now(),
    })
  }

  private async *checkForPendingToolCalls(): AsyncGenerator<
    StreamChunk,
    ToolPhaseResult,
    void
  > {
    const pendingToolCalls = this.getPendingToolCallsFromMessages()
    if (pendingToolCalls.length === 0) {
      return 'continue'
    }

    const doneChunk = this.createSyntheticDoneChunk()

    aiEventClient.emit('text:iteration', {
      requestId: this.requestId,
      streamId: this.streamId,
      iterationNumber: this.iterationCount + 1,
      messageCount: this.messages.length,
      toolCallCount: pendingToolCalls.length,
      timestamp: Date.now(),
    })

    const { approvals, clientToolResults } = this.collectClientState()

    const executionResult = await executeToolCalls(
      pendingToolCalls,
      this.tools,
      approvals,
      clientToolResults,
    )

    if (
      executionResult.needsApproval.length > 0 ||
      executionResult.needsClientExecution.length > 0
    ) {
      for (const chunk of this.emitApprovalRequests(
        executionResult.needsApproval,
        doneChunk,
      )) {
        yield chunk
      }

      for (const chunk of this.emitClientToolInputs(
        executionResult.needsClientExecution,
        doneChunk,
      )) {
        yield chunk
      }

      this.shouldEmitStreamEnd = false
      return 'wait'
    }

    const toolResultChunks = this.emitToolResults(
      executionResult.results,
      doneChunk,
    )

    for (const chunk of toolResultChunks) {
      yield chunk
    }

    return 'continue'
  }

  private async *processToolCalls(): AsyncGenerator<StreamChunk, void, void> {
    if (!this.shouldExecuteToolPhase()) {
      this.setToolPhase('stop')
      return
    }

    const toolCalls = this.toolCallManager.getToolCalls()
    const doneChunk = this.doneChunk

    if (!doneChunk || toolCalls.length === 0) {
      this.setToolPhase('stop')
      return
    }

    aiEventClient.emit('text:iteration', {
      requestId: this.requestId,
      streamId: this.streamId,
      iterationNumber: this.iterationCount + 1,
      messageCount: this.messages.length,
      toolCallCount: toolCalls.length,
      timestamp: Date.now(),
    })

    this.addAssistantToolCallMessage(toolCalls)

    const { approvals, clientToolResults } = this.collectClientState()

    const executionResult = await executeToolCalls(
      toolCalls,
      this.tools,
      approvals,
      clientToolResults,
    )

    if (
      executionResult.needsApproval.length > 0 ||
      executionResult.needsClientExecution.length > 0
    ) {
      for (const chunk of this.emitApprovalRequests(
        executionResult.needsApproval,
        doneChunk,
      )) {
        yield chunk
      }

      for (const chunk of this.emitClientToolInputs(
        executionResult.needsClientExecution,
        doneChunk,
      )) {
        yield chunk
      }

      this.setToolPhase('wait')
      return
    }

    const toolResultChunks = this.emitToolResults(
      executionResult.results,
      doneChunk,
    )

    for (const chunk of toolResultChunks) {
      yield chunk
    }

    this.toolCallManager.clear()

    this.setToolPhase('continue')
  }

  private shouldExecuteToolPhase(): boolean {
    return (
      this.doneChunk?.finishReason === 'tool_calls' &&
      this.tools.length > 0 &&
      this.toolCallManager.hasToolCalls()
    )
  }

  private addAssistantToolCallMessage(toolCalls: Array<ToolCall>): void {
    this.messages = [
      ...this.messages,
      {
        role: 'assistant',
        content: this.accumulatedContent || null,
        toolCalls,
      },
    ]
  }

  private collectClientState(): {
    approvals: Map<string, boolean>
    clientToolResults: Map<string, any>
  } {
    const approvals = new Map<string, boolean>()
    const clientToolResults = new Map<string, any>()

    for (const message of this.messages) {
      if (message.role === 'assistant' && (message as any).parts) {
        const parts = (message as any).parts
        for (const part of parts) {
          if (
            part.type === 'tool-call' &&
            part.state === 'approval-responded' &&
            part.approval
          ) {
            approvals.set(part.approval.id, part.approval.approved)
          }

          if (
            part.type === 'tool-call' &&
            part.output !== undefined &&
            !part.approval
          ) {
            clientToolResults.set(part.id, part.output)
          }
        }
      }
    }

    return { approvals, clientToolResults }
  }

  private emitApprovalRequests(
    approvals: Array<ApprovalRequest>,
    doneChunk: DoneStreamChunk,
  ): Array<StreamChunk> {
    const chunks: Array<StreamChunk> = []

    for (const approval of approvals) {
      aiEventClient.emit('stream:approval-requested', {
        streamId: this.streamId,
        messageId: this.currentMessageId || undefined,
        toolCallId: approval.toolCallId,
        toolName: approval.toolName,
        input: approval.input,
        approvalId: approval.approvalId,
        timestamp: Date.now(),
      })

      chunks.push({
        type: 'approval-requested',
        id: doneChunk.id,
        model: doneChunk.model,
        timestamp: Date.now(),
        toolCallId: approval.toolCallId,
        toolName: approval.toolName,
        input: approval.input,
        approval: {
          id: approval.approvalId,
          needsApproval: true,
        },
      })
    }

    return chunks
  }

  private emitClientToolInputs(
    clientRequests: Array<ClientToolRequest>,
    doneChunk: DoneStreamChunk,
  ): Array<StreamChunk> {
    const chunks: Array<StreamChunk> = []

    for (const clientTool of clientRequests) {
      aiEventClient.emit('stream:tool-input-available', {
        streamId: this.streamId,
        messageId: this.currentMessageId || undefined,
        toolCallId: clientTool.toolCallId,
        toolName: clientTool.toolName,
        input: clientTool.input,
        timestamp: Date.now(),
      })

      chunks.push({
        type: 'tool-input-available',
        id: doneChunk.id,
        model: doneChunk.model,
        timestamp: Date.now(),
        toolCallId: clientTool.toolCallId,
        toolName: clientTool.toolName,
        input: clientTool.input,
      })
    }

    return chunks
  }

  private emitToolResults(
    results: Array<ToolResult>,
    doneChunk: DoneStreamChunk,
  ): Array<StreamChunk> {
    const chunks: Array<StreamChunk> = []

    for (const result of results) {
      aiEventClient.emit('tool:call-completed', {
        requestId: this.requestId,
        streamId: this.streamId,
        messageId: this.currentMessageId || undefined,
        toolCallId: result.toolCallId,
        toolName: result.toolName,
        result: result.result,
        duration: result.duration ?? 0,
        timestamp: Date.now(),
      })

      const content = JSON.stringify(result.result)
      const chunk: Extract<StreamChunk, { type: 'tool_result' }> = {
        type: 'tool_result',
        id: doneChunk.id,
        model: doneChunk.model,
        timestamp: Date.now(),
        toolCallId: result.toolCallId,
        content,
      }

      chunks.push(chunk)

      this.messages = [
        ...this.messages,
        {
          role: 'tool',
          content,
          toolCallId: result.toolCallId,
        },
      ]
    }

    return chunks
  }

  private getPendingToolCallsFromMessages(): Array<ToolCall> {
    const completedToolIds = new Set(
      this.messages
        .filter((message) => message.role === 'tool' && message.toolCallId)
        .map((message) => message.toolCallId!),
    )

    const pending: Array<ToolCall> = []

    for (const message of this.messages) {
      if (message.role === 'assistant' && message.toolCalls) {
        for (const toolCall of message.toolCalls) {
          if (!completedToolIds.has(toolCall.id)) {
            pending.push(toolCall)
          }
        }
      }
    }

    return pending
  }

  private createSyntheticDoneChunk(): DoneStreamChunk {
    return {
      type: 'done',
      id: this.createId('pending'),
      model: 'agent-loop',
      timestamp: Date.now(),
      finishReason: 'tool_calls',
    }
  }

  private shouldContinue(): boolean {
    if (this.cyclePhase === 'executeToolCalls') {
      return true
    }

    return (
      this.loopStrategy({
        iterationCount: this.iterationCount,
        messages: this.messages,
        finishReason: this.lastFinishReason,
      }) && this.toolPhase === 'continue'
    )
  }

  private isAborted(): boolean {
    return !!this.effectiveSignal?.aborted
  }

  private setToolPhase(phase: ToolPhaseResult): void {
    this.toolPhase = phase
    if (phase === 'wait') {
      this.shouldEmitStreamEnd = false
    }
  }

  private createId(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
  }
}

// ===========================
// Public API
// ===========================

/**
 * Agent loop - orchestrates agentic text generation with automatic tool execution.
 *
 * Takes a text creator function and loop options, then handles the agentic loop:
 * - Calls the text function to get model responses
 * - Automatically executes tool calls
 * - Continues looping until the strategy says stop
 *
 * The return type depends on whether `outputSchema` is provided:
 * - Without outputSchema: Returns `AsyncIterable<StreamChunk>`
 * - With outputSchema: Returns `Promise<z.infer<TSchema>>`
 *
 * @param textFn - A function that creates a text stream or structured output.
 *                 Should be a partial application of text() with adapter/model pre-configured.
 * @param options - Loop options including messages, tools, strategy, and optional outputSchema
 *
 * @example Create the text function factory
 * ```ts
 * import { experimental_agentLoop as agentLoop, experimental_text as text } from '@tanstack/ai'
 *
 * // Factory with adapter and model pre-configured
 * const textFn = (opts) => text({ adapter: openaiText(), model: 'gpt-4o', ...opts })
 * ```
 *
 * @example Streaming mode
 * ```ts
 * for await (const chunk of agentLoop(textFn, {
 *   messages: [{ role: 'user', content: 'What is the weather?' }],
 *   tools: [weatherTool]
 * })) {
 *   if (chunk.type === 'content') {
 *     process.stdout.write(chunk.delta)
 *   }
 * }
 * ```
 *
 * @example Collect text with toText helper
 * ```ts
 * const result = await toText(agentLoop(textFn, {
 *   messages: [{ role: 'user', content: 'Research this topic' }],
 *   tools: [searchTool]
 * }))
 * ```
 *
 * @example Structured output mode
 * ```ts
 * const result = await agentLoop(textFn, {
 *   messages: [{ role: 'user', content: 'Research and summarize' }],
 *   tools: [searchTool],
 *   outputSchema: z.object({ summary: z.string() })
 * })
 * // result is { summary: string }
 * ```
 */
export function agentLoop<TSchema extends z.ZodType>(
  textFn: TextCreator,
  options: AgentLoopStructuredOptions<TSchema>,
): Promise<z.infer<TSchema>>
export function agentLoop(
  textFn: TextCreator,
  options: AgentLoopStreamOptions,
): AsyncIterable<StreamChunk>
export function agentLoop<TSchema extends z.ZodType | undefined = undefined>(
  textFn: TextCreator,
  options: AgentLoopOptions<TSchema>,
): TSchema extends z.ZodType
  ? Promise<z.infer<TSchema>>
  : AsyncIterable<StreamChunk>
export function agentLoop<TSchema extends z.ZodType | undefined = undefined>(
  textFn: TextCreator,
  options: AgentLoopOptions<TSchema>,
): Promise<z.infer<TSchema>> | AsyncIterable<StreamChunk> {
  // Check if structured output is requested
  const structuredOptions = options as AgentLoopStructuredOptions<z.ZodType>
  if (structuredOptions.outputSchema !== undefined) {
    return runStructuredAgentLoop(
      textFn,
      structuredOptions,
    ) as Promise<z.infer<TSchema>>
  }

  // Otherwise return streaming
  const engine = new AgentLoopEngine({ textFn, options })
  return engine.run()
}

/**
 * Run the agent loop and return structured output.
 */
async function runStructuredAgentLoop<TSchema extends z.ZodType>(
  textFn: TextCreator,
  options: AgentLoopStructuredOptions<TSchema>,
): Promise<z.infer<TSchema>> {
  const { outputSchema, ...loopOptions } = options

  const engine = new AgentLoopEngine({ textFn, options: loopOptions })

  // Consume the stream to run the agentic loop
  for await (const _chunk of engine.run()) {
    // Just consume the stream to execute the agentic loop
  }

  // Get the final messages
  const finalMessages = engine.getMessages()

  // Call textFn with outputSchema to get structured output
  const result = await textFn({
    messages: finalMessages,
    systemPrompts: options.systemPrompts,
    abortController: options.abortController,
    outputSchema,
  })

  return result as z.infer<TSchema>
}

// Re-export types
export type { AgentLoopStrategy } from '../types'
