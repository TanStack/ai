/**
 * Text Activity
 *
 * Handles agentic text generation, one-shot text generation, and agentic structured output.
 * This is a self-contained module with implementation, types, and JSDoc.
 */

import { aiEventClient } from '../../event-client.js'
import { streamToText } from '../../stream-to-response.js'
import { ToolCallManager, executeToolCalls } from './tools/tool-calls'
// Schema conversion is now done at the adapter level
// Each adapter imports and uses convertZodToJsonSchema with provider-specific options
import { maxIterations as maxIterationsStrategy } from './agent-loop-strategies'
import type {
  ApprovalRequest,
  ClientToolRequest,
  ToolResult,
} from './tools/tool-calls'
import type { z } from 'zod'
import type { TextAdapter } from './adapter'
import type {
  AIAdapter,
  AgentLoopStrategy,
  DefaultMessageMetadataByModality,
  DoneStreamChunk,
  Modality,
  ModelMessage,
  StreamChunk,
  TextOptions,
  TextStreamOptionsUnion,
  Tool,
  ToolCall,
} from '../../types'

// ===========================
// Activity Kind
// ===========================

/** The adapter kind this activity handles */
export const kind = 'text' as const

// ===========================
// Common Options
// ===========================

/**
 * Common options shared across different AI provider implementations.
 * These options represent the standard parameters that work across OpenAI, Anthropic, and Gemini.
 */
export interface CommonOptions {
  /**
   * Controls the randomness of the output.
   * Higher values (e.g., 0.8) make output more random, lower values (e.g., 0.2) make it more focused and deterministic.
   * Range: [0.0, 2.0]
   *
   * Note: Generally recommended to use either temperature or topP, but not both.
   *
   * Provider usage:
   * - OpenAI: `temperature` (number) - in text.top_p field
   * - Anthropic: `temperature` (number) - ranges from 0.0 to 1.0, default 1.0
   * - Gemini: `generationConfig.temperature` (number) - ranges from 0.0 to 2.0
   */
  temperature?: number

  /**
   * Nucleus sampling parameter. An alternative to temperature sampling.
   * The model considers the results of tokens with topP probability mass.
   * For example, 0.1 means only tokens comprising the top 10% probability mass are considered.
   *
   * Note: Generally recommended to use either temperature or topP, but not both.
   *
   * Provider usage:
   * - OpenAI: `text.top_p` (number)
   * - Anthropic: `top_p` (number | null)
   * - Gemini: `generationConfig.topP` (number)
   */
  topP?: number

  /**
   * The maximum number of tokens to generate in the response.
   *
   * Provider usage:
   * - OpenAI: `max_output_tokens` (number) - includes visible output and reasoning tokens
   * - Anthropic: `max_tokens` (number, required) - range x >= 1
   * - Gemini: `generationConfig.maxOutputTokens` (number)
   */
  maxTokens?: number

  /**
   * Additional metadata to attach to the request.
   * Can be used for tracking, debugging, or passing custom information.
   * Structure and constraints vary by provider.
   *
   * Provider usage:
   * - OpenAI: `metadata` (Record<string, string>) - max 16 key-value pairs, keys max 64 chars, values max 512 chars
   * - Anthropic: `metadata` (Record<string, any>) - includes optional user_id (max 256 chars)
   * - Gemini: Not directly available in TextProviderOptions
   */
  metadata?: Record<string, any>
}

// ===========================
// Type Extraction Helpers
// ===========================

/** Extract model types from a TextAdapter */
export type TextModels<TAdapter> =
  TAdapter extends TextAdapter<infer M, any, any, any, any> ? M[number] : string

/**
 * Extract model-specific provider options from a TextAdapter.
 * If the model has specific options defined in ModelOptions (and not just via index signature),
 * use those; otherwise fall back to base provider options.
 */
export type TextProviderOptionsForModel<TAdapter, TModel extends string> =
  TAdapter extends TextAdapter<
    any,
    infer BaseOptions,
    infer ModelOptions,
    any,
    any
  >
  ? string extends keyof ModelOptions
  ? // ModelOptions is Record<string, unknown> or has index signature - use BaseOptions
  BaseOptions
  : // ModelOptions has explicit keys - check if TModel is one of them
  TModel extends keyof ModelOptions
  ? ModelOptions[TModel]
  : BaseOptions
  : object

/**
 * Extract input modalities for a specific model from a TextAdapter.
 * Returns the modalities array if the model is defined in the map, otherwise all modalities.
 */
export type InputModalitiesForModel<TAdapter, TModel extends string> =
  TAdapter extends TextAdapter<any, any, any, infer ModalitiesByName, any>
  ? TModel extends keyof ModalitiesByName
  ? ModalitiesByName[TModel]
  : ReadonlyArray<Modality>
  : ReadonlyArray<Modality>

/**
 * Extract message metadata types by modality from a TextAdapter.
 * Returns the adapter's metadata map or defaults if not defined.
 */
export type MessageMetadataForAdapter<TAdapter> =
  TAdapter extends TextAdapter<any, any, any, any, infer MetadataByModality>
  ? MetadataByModality
  : DefaultMessageMetadataByModality

// ===========================
// Activity Options Type
// ===========================

/**
 * Options for the text activity.
 *
 * @template TAdapter - The text adapter type
 * @template TModel - The model name type (inferred from adapter)
 * @template TSchema - Optional Zod schema for structured output
 * @template TStream - Whether to stream the output (default: true)
 */
export interface TextActivityOptions<
  TAdapter extends TextAdapter<ReadonlyArray<string>, object, any, any, any>,
  TModel extends TextModels<TAdapter>,
  TSchema extends z.ZodType | undefined = undefined,
  TStream extends boolean = true,
> {
  /** The text adapter to use */
  adapter: TAdapter & { kind: typeof kind }
  /** The model name (autocompletes based on adapter) */
  model: TModel
  /** Conversation messages */
  messages: Array<ModelMessage>
  /** System prompts to prepend to the conversation */
  systemPrompts?: TextOptions['systemPrompts']
  /** Tools for function calling (auto-executed when called) */
  tools?: TextOptions['tools']
  /** Additional options like temperature, maxTokens, etc. */
  options?: TextOptions['options']
  /** Provider-specific options */
  providerOptions?: TextProviderOptionsForModel<TAdapter, TModel>
  /** AbortController for cancellation */
  abortController?: TextOptions['abortController']
  /** Strategy for controlling the agent loop */
  agentLoopStrategy?: TextOptions['agentLoopStrategy']
  /** Unique conversation identifier for tracking */
  conversationId?: TextOptions['conversationId']
  /**
   * Optional Zod schema for structured output.
   * When provided, the activity will:
   * 1. Run the full agentic loop (executing tools as needed)
   * 2. Once complete, return a Promise with the parsed output matching the schema
   *
   * @example
   * ```ts
   * const result = await ai({
   *   adapter: openaiText(),
   *   model: 'gpt-4o',
   *   messages: [{ role: 'user', content: 'Generate a person' }],
   *   outputSchema: z.object({ name: z.string(), age: z.number() })
   * })
   * // result is { name: string, age: number }
   * ```
   */
  outputSchema?: TSchema
  /**
   * Whether to stream the text result.
   * When true (default), returns an AsyncIterable<StreamChunk> for streaming output.
   * When false, returns a Promise<string> with the collected text content.
   *
   * Note: If outputSchema is provided, this option is ignored and the result
   * is always a Promise<z.infer<TSchema>>.
   *
   * @default true
   *
   * @example Non-streaming text
   * ```ts
   * const text = await ai({
   *   adapter: openaiText(),
   *   model: 'gpt-4o',
   *   messages: [{ role: 'user', content: 'Hello!' }],
   *   stream: false
   * })
   * // text is a string with the full response
   * ```
   */
  stream?: TStream
}

// ===========================
// Activity Result Type
// ===========================

/**
 * Result type for the text activity.
 * - If outputSchema is provided: Promise<z.infer<TSchema>>
 * - If stream is false: Promise<string>
 * - Otherwise (stream is true, default): AsyncIterable<StreamChunk>
 */
export type TextActivityResult<
  TSchema extends z.ZodType | undefined,
  TStream extends boolean = true,
> = TSchema extends z.ZodType
  ? Promise<z.infer<TSchema>>
  : TStream extends false
  ? Promise<string>
  : AsyncIterable<StreamChunk>

// ===========================
// ChatEngine Implementation
// ===========================

interface TextEngineConfig<
  TAdapter extends TextAdapter<any, any, any, any, any>,
  TParams extends TextOptions<any, any> = TextOptions<any>,
> {
  adapter: TAdapter
  systemPrompts?: Array<string>
  params: TParams
}

type ToolPhaseResult = 'continue' | 'stop' | 'wait'
type CyclePhase = 'processText' | 'executeToolCalls'

class TextEngine<
  TAdapter extends TextAdapter<any, any, any, any, any>,
  TParams extends TextOptions<any, any> = TextOptions<any>,
> {
  private readonly adapter: TAdapter
  private readonly params: TParams
  private readonly systemPrompts: Array<string>
  private readonly tools: ReadonlyArray<Tool>
  private readonly loopStrategy: AgentLoopStrategy
  private readonly toolCallManager: ToolCallManager
  private readonly initialMessageCount: number
  private readonly requestId: string
  private readonly streamId: string
  private readonly effectiveRequest?: Request | RequestInit
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

  constructor(config: TextEngineConfig<TAdapter, TParams>) {
    this.adapter = config.adapter
    this.params = config.params
    this.systemPrompts = config.params.systemPrompts || []
    this.tools = config.params.tools || []
    this.loopStrategy =
      config.params.agentLoopStrategy || maxIterationsStrategy(5)
    this.toolCallManager = new ToolCallManager(this.tools)
    this.initialMessageCount = config.params.messages.length
    this.messages = config.params.messages
    this.requestId = this.createId('chat')
    this.streamId = this.createId('stream')
    this.effectiveRequest = config.params.abortController
      ? { signal: config.params.abortController.signal }
      : undefined
    this.effectiveSignal = config.params.abortController?.signal
  }

  /** Get the accumulated content after the chat loop completes */
  getAccumulatedContent(): string {
    return this.accumulatedContent
  }

  /** Get the final messages array after the chat loop completes */
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
          yield* this.streamModelResponse()
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
    const { model, tools, options, providerOptions, conversationId } =
      this.params

    aiEventClient.emit('text:started', {
      requestId: this.requestId,
      streamId: this.streamId,
      model: model,
      provider: this.adapter.name,
      messageCount: this.initialMessageCount,
      hasTools: !!tools && tools.length > 0,
      streaming: true,
      timestamp: Date.now(),
      clientId: conversationId,
      toolNames: tools?.map((t) => t.name),
      options: options as Record<string, unknown> | undefined,
      providerOptions: providerOptions as Record<string, unknown> | undefined,
    })

    aiEventClient.emit('stream:started', {
      streamId: this.streamId,
      model,
      provider: this.adapter.name,
      timestamp: Date.now(),
    })
  }

  private afterRun(): void {
    if (!this.shouldEmitStreamEnd) {
      return
    }

    const now = Date.now()

    // Emit text:completed with final state
    aiEventClient.emit('text:completed', {
      requestId: this.requestId,
      streamId: this.streamId,
      model: this.params.model,
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

  private async *streamModelResponse(): AsyncGenerator<StreamChunk> {
    const adapterOptions = this.params.options || {}
    const providerOptions = this.params.providerOptions
    const tools = this.params.tools

    for await (const chunk of this.adapter.chatStream({
      model: this.params.model,
      messages: this.messages,
      tools,
      options: adapterOptions,
      request: this.effectiveRequest,
      providerOptions,
      systemPrompts: this.systemPrompts,
    })) {
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
    // This can happen when adapters send multiple done chunks
    if (
      this.doneChunk?.finishReason === 'tool_calls' &&
      chunk.finishReason === 'stop'
    ) {
      // Still emit the event and update lastFinishReason, but don't overwrite doneChunk
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
          model: this.params.model,
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
        model: this.params.model,
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
      // todo remove any and fix this
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
        .map((message) => message.toolCallId!), // toolCallId exists due to filter
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
      model: this.params.model,
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
// Activity Implementation
// ===========================

/**
 * Text activity - handles agentic text generation, one-shot text generation, and agentic structured output.
 *
 * This activity supports four modes:
 * 1. **Streaming agentic text**: Stream responses with automatic tool execution
 * 2. **Streaming one-shot text**: Simple streaming request/response without tools
 * 3. **Non-streaming text**: Returns collected text as a string (stream: false)
 * 4. **Agentic structured output**: Run tools, then return structured data
 *
 * @example Full agentic text (streaming with tools)
 * ```ts
 * import { ai } from '@tanstack/ai'
 * import { openaiText } from '@tanstack/ai-openai'
 *
 * for await (const chunk of ai({
 *   adapter: openaiText(),
 *   model: 'gpt-4o',
 *   messages: [{ role: 'user', content: 'What is the weather?' }],
 *   tools: [weatherTool]
 * })) {
 *   if (chunk.type === 'content') {
 *     console.log(chunk.delta)
 *   }
 * }
 * ```
 *
 * @example One-shot text (streaming without tools)
 * ```ts
 * for await (const chunk of ai({
 *   adapter: openaiText(),
 *   model: 'gpt-4o',
 *   messages: [{ role: 'user', content: 'Hello!' }]
 * })) {
 *   console.log(chunk)
 * }
 * ```
 *
 * @example Non-streaming text (stream: false)
 * ```ts
 * const text = await ai({
 *   adapter: openaiText(),
 *   model: 'gpt-4o',
 *   messages: [{ role: 'user', content: 'Hello!' }],
 *   stream: false
 * })
 * // text is a string with the full response
 * ```
 *
 * @example Agentic structured output (tools + structured response)
 * ```ts
 * import { z } from 'zod'
 *
 * const result = await ai({
 *   adapter: openaiText(),
 *   model: 'gpt-4o',
 *   messages: [{ role: 'user', content: 'Research and summarize the topic' }],
 *   tools: [researchTool, analyzeTool],
 *   outputSchema: z.object({
 *     summary: z.string(),
 *     keyPoints: z.array(z.string())
 *   })
 * })
 * // result is { summary: string, keyPoints: string[] }
 * ```
 */
export function textActivity<
  TAdapter extends TextAdapter<ReadonlyArray<string>, object, any, any, any>,
  TModel extends TextModels<TAdapter>,
  TSchema extends z.ZodType | undefined = undefined,
  TStream extends boolean = true,
>(
  options: TextActivityOptions<TAdapter, TModel, TSchema, TStream>,
): TextActivityResult<TSchema, TStream> {
  const { outputSchema, stream } = options

  // If outputSchema is provided, run agentic structured output
  if (outputSchema) {
    return runAgenticStructuredOutput(
      options as unknown as TextActivityOptions<
        TextAdapter<ReadonlyArray<string>, object, any, any, any>,
        string,
        z.ZodType,
        boolean
      >,
    ) as TextActivityResult<TSchema, TStream>
  }

  // If stream is explicitly false, run non-streaming text
  if (stream === false) {
    return runNonStreamingText(
      options as unknown as TextActivityOptions<
        TextAdapter<ReadonlyArray<string>, object, any, any, any>,
        string,
        undefined,
        false
      >,
    ) as TextActivityResult<TSchema, TStream>
  }

  // Otherwise, run streaming text (default)
  return runStreamingText(
    options as unknown as TextActivityOptions<
      TextAdapter<ReadonlyArray<string>, object, any, any, any>,
      string,
      undefined,
      true
    >,
  ) as TextActivityResult<TSchema, TStream>
}

/**
 * Run streaming text (agentic or one-shot depending on tools)
 */
async function* runStreamingText(
  options: TextActivityOptions<
    TextAdapter<ReadonlyArray<string>, object, any, any, any>,
    string,
    undefined,
    true
  >,
): AsyncIterable<StreamChunk> {
  const { adapter, ...textOptions } = options

  const engine = new TextEngine({
    adapter,
    params: textOptions as TextOptions<
      string,
      Record<string, any>,
      undefined,
      Record<string, any>
    >,
  })

  for await (const chunk of engine.run()) {
    yield chunk
  }
}

/**
 * Run non-streaming text - collects all content and returns as a string.
 * Runs the full agentic loop (if tools are provided) but returns collected text.
 */
function runNonStreamingText(
  options: TextActivityOptions<
    TextAdapter<ReadonlyArray<string>, object, any, any, any>,
    string,
    undefined,
    false
  >,
): Promise<string> {
  // Run the streaming text and collect all text using streamToText
  const stream = runStreamingText(
    options as unknown as TextActivityOptions<
      TextAdapter<ReadonlyArray<string>, object, any, any, any>,
      string,
      undefined,
      true
    >,
  )

  return streamToText(stream)
}

/**
 * Run agentic structured output:
 * 1. Execute the full agentic loop (with tools)
 * 2. Once complete, call adapter.structuredOutput with the conversation context
 * 3. Validate and return the structured result
 */
async function runAgenticStructuredOutput<TSchema extends z.ZodType>(
  options: TextActivityOptions<
    TextAdapter<ReadonlyArray<string>, object, any, any, any>,
    string,
    TSchema,
    boolean
  >,
): Promise<z.infer<TSchema>> {
  const { adapter, outputSchema, ...textOptions } = options

  if (!outputSchema) {
    throw new Error('outputSchema is required for structured output')
  }

  // Create the engine and run the agentic loop
  const engine = new TextEngine({
    adapter,
    params: textOptions as TextOptions<
      string,
      Record<string, any>,
      undefined,
      Record<string, any>
    >,
  })

  // Consume the stream to run the agentic loop
  for await (const _chunk of engine.run()) {
    // Just consume the stream to execute the agentic loop
  }

  // Get the final messages from the engine (includes tool results)
  const finalMessages = engine.getMessages()

  // Build text options for structured output, excluding tools since
  // the agentic loop is complete and we only need the final response
  const {
    tools: _tools,
    agentLoopStrategy: _als,
    ...structuredTextOptions
  } = textOptions

  // Call the adapter's structured output method with the conversation context
  // Each adapter is responsible for converting the Zod schema to its provider's format
  const result = await adapter.structuredOutput({
    chatOptions: {
      ...structuredTextOptions,
      messages: finalMessages,
    },
    outputSchema,
  })

  // Validate the result against the Zod schema
  const validationResult = outputSchema.safeParse(result.data)
  if (!validationResult.success) {
    throw new Error(
      `Structured output validation failed: ${validationResult.error.message}`,
    )
  }

  return validationResult.data
}

// ===========================
// Text Options Helper
// ===========================

/**
 * Type-safe helper to create text options with model-specific provider options.
 *
 * @example
 * ```ts
 * import { textOptions, ai } from '@tanstack/ai'
 * import { openaiText } from '@tanstack/ai-openai'
 *
 * const opts = textOptions({
 *   adapter: openaiText(),
 *   model: 'gpt-4o',
 *   options: { temperature: 0.7 }
 * })
 * ```
 */
export function textOptions<
  TAdapter extends AIAdapter<any, any, any, any, any>,
  const TModel extends TAdapter extends AIAdapter<
    infer Models,
    any,
    any,
    any,
    any
  >
  ? Models[number]
  : string,
>(
  options: Omit<
    TextStreamOptionsUnion<TAdapter>,
    'providerOptions' | 'model' | 'messages' | 'abortController'
  > & {
    adapter: TAdapter
    model: TModel
    providerOptions?: TAdapter extends AIAdapter<
      any,
      any,
      any,
      any,
      infer ModelProviderOptions
    >
    ? TModel extends keyof ModelProviderOptions
    ? ModelProviderOptions[TModel]
    : never
    : never
  },
): typeof options {
  return options
}

// Re-export adapter types
export type {
  TextAdapter,
  TextAdapterConfig,
  StructuredOutputOptions,
  StructuredOutputResult,
} from './adapter'
export { BaseTextAdapter } from './adapter'
