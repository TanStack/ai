/**
 * Text Activity
 *
 * Handles agentic text generation, one-shot text generation, and agentic structured output.
 * This is a self-contained module with implementation, types, and JSDoc.
 */

import { aiEventClient } from '../../event-client.js'
import { streamToText } from '../../stream-to-response.js'
import { ToolCallManager, executeToolCalls } from './tools/tool-calls'
import {
  convertSchemaToJsonSchema,
  isStandardSchema,
  parseWithStandardSchema,
} from './tools/schema-converter'
import { maxIterations as maxIterationsStrategy } from './agent-loop-strategies'
import type {
  ApprovalRequest,
  ClientToolRequest,
  ToolResult,
} from './tools/tool-calls'
import type { AnyTextAdapter } from './adapter'
import type {
  AgentLoopStrategy,
  ConstrainedModelMessage,
  InferSchemaType,
  ModelMessage,
  RunFinishedEvent,
  SchemaInput,
  StreamChunk,
  TextMessageContentEvent,
  TextOptions,
  Tool,
  ToolCall,
  ToolCallArgsEvent,
  ToolCallEndEvent,
  ToolCallStartEvent,
} from '../../types'

// ===========================
// Activity Kind
// ===========================

/** The adapter kind this activity handles */
export const kind = 'text' as const

// ===========================
// Activity Options Type
// ===========================

/**
 * Options for the text activity.
 * Types are extracted directly from the adapter (which has pre-resolved generics).
 *
 * @template TAdapter - The text adapter type (created by a provider function)
 * @template TSchema - Optional Standard Schema for structured output
 * @template TStream - Whether to stream the output (default: true)
 */
export interface TextActivityOptions<
  TAdapter extends AnyTextAdapter,
  TSchema extends SchemaInput | undefined,
  TStream extends boolean,
> {
  /** The text adapter to use (created by a provider function like openaiText('gpt-4o')) */
  adapter: TAdapter
  /** Conversation messages - content types are constrained by the adapter's input modalities and metadata */
  messages?: Array<
    ConstrainedModelMessage<{
      inputModalities: TAdapter['~types']['inputModalities']
      messageMetadataByModality: TAdapter['~types']['messageMetadataByModality']
    }>
  >
  /** System prompts to prepend to the conversation */
  systemPrompts?: TextOptions['systemPrompts']
  /** Tools for function calling (auto-executed when called) */
  tools?: TextOptions['tools']
  /** Controls the randomness of the output. Higher values make output more random. Range: [0.0, 2.0] */
  temperature?: TextOptions['temperature']
  /** Nucleus sampling parameter. The model considers tokens with topP probability mass. */
  topP?: TextOptions['topP']
  /** The maximum number of tokens to generate in the response. */
  maxTokens?: TextOptions['maxTokens']
  /** Additional metadata to attach to the request. */
  metadata?: TextOptions['metadata']
  /** Model-specific provider options (type comes from adapter) */
  modelOptions?: TAdapter['~types']['providerOptions']
  /** AbortController for cancellation */
  abortController?: TextOptions['abortController']
  /** Strategy for controlling the agent loop */
  agentLoopStrategy?: TextOptions['agentLoopStrategy']
  /** Unique conversation identifier for tracking */
  conversationId?: TextOptions['conversationId']
  /**
   * Optional Standard Schema for structured output.
   * When provided, the activity will:
   * 1. Run the full agentic loop (executing tools as needed)
   * 2. Once complete, return a Promise with the parsed output matching the schema
   *
   * Supports any Standard Schema compliant library (Zod v4+, ArkType, Valibot, etc.)
   *
   * @example
   * ```ts
   * const result = await chat({
   *   adapter: openaiText('gpt-4o'),
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
   * is always a Promise<InferSchemaType<TSchema>>.
   *
   * @default true
   *
   * @example Non-streaming text
   * ```ts
   * const text = await chat({
   *   adapter: openaiText('gpt-4o'),
   *   messages: [{ role: 'user', content: 'Hello!' }],
   *   stream: false
   * })
   * // text is a string with the full response
   * ```
   */
  stream?: TStream
}

// ===========================
// Chat Options Helper
// ===========================

/**
 * Create typed options for the chat() function without executing.
 * This is useful for pre-defining configurations with full type inference.
 *
 * @example
 * ```ts
 * const chatOptions = createChatOptions({
 *   adapter: anthropicText('claude-sonnet-4-5'),
 * })
 *
 * const stream = chat({ ...chatOptions, messages })
 * ```
 */
export function createChatOptions<
  TAdapter extends AnyTextAdapter,
  TSchema extends SchemaInput | undefined = undefined,
  TStream extends boolean = true,
>(
  options: TextActivityOptions<TAdapter, TSchema, TStream>,
): TextActivityOptions<TAdapter, TSchema, TStream> {
  return options
}

// ===========================
// Activity Result Type
// ===========================

/**
 * Result type for the text activity.
 * - If outputSchema is provided: Promise<InferSchemaType<TSchema>>
 * - If stream is false: Promise<string>
 * - Otherwise (stream is true, default): AsyncIterable<StreamChunk>
 */
export type TextActivityResult<
  TSchema extends SchemaInput | undefined,
  TStream extends boolean = true,
> = TSchema extends SchemaInput
  ? Promise<InferSchemaType<TSchema>>
  : TStream extends false
    ? Promise<string>
    : AsyncIterable<StreamChunk>

// ===========================
// ChatEngine Implementation
// ===========================

interface TextEngineConfig<
  TAdapter extends AnyTextAdapter,
  TParams extends TextOptions<any, any> = TextOptions<any>,
> {
  adapter: TAdapter
  systemPrompts?: Array<string>
  params: TParams
}

type ToolPhaseResult = 'continue' | 'stop' | 'wait'
type CyclePhase = 'processText' | 'executeToolCalls'

class TextEngine<
  TAdapter extends AnyTextAdapter,
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
  private eventOptions?: Record<string, unknown>
  private eventToolNames?: Array<string>
  private finishedEvent: RunFinishedEvent | null = null
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
    const { tools, temperature, topP, maxTokens, metadata } = this.params

    // Gather flattened options into an object for event emission
    const options: Record<string, unknown> = {}
    if (temperature !== undefined) options.temperature = temperature
    if (topP !== undefined) options.topP = topP
    if (maxTokens !== undefined) options.maxTokens = maxTokens
    if (metadata !== undefined) options.metadata = metadata

    this.eventOptions = Object.keys(options).length > 0 ? options : undefined
    this.eventToolNames = tools?.map((t) => t.name)

    aiEventClient.emit('text:request:started', {
      ...this.buildTextEventContext(),
      timestamp: Date.now(),
    })

    // Always emit messages for tracking:
    // - For existing conversations (with conversationId): only emit the latest user message
    // - For new conversations (without conversationId): emit all messages for reconstruction
    const messagesToEmit = this.params.conversationId
      ? this.messages.slice(-1).filter((m) => m.role === 'user')
      : this.messages

    messagesToEmit.forEach((message, index) => {
      const messageIndex = this.params.conversationId
        ? this.messages.length - 1
        : index
      const messageId = this.createId('msg')
      const baseContext = this.buildTextEventContext()
      const content = this.getContentString(message.content)

      aiEventClient.emit('text:message:created', {
        ...baseContext,
        messageId,
        role: message.role,
        content,
        toolCalls: message.toolCalls,
        messageIndex,
        timestamp: Date.now(),
      })

      if (message.role === 'user') {
        aiEventClient.emit('text:message:user', {
          ...baseContext,
          messageId,
          role: 'user',
          content,
          messageIndex,
          timestamp: Date.now(),
        })
      }
    })
  }

  private afterRun(): void {
    if (!this.shouldEmitStreamEnd) {
      return
    }

    const now = Date.now()
    // Emit text:request:completed with final state
    aiEventClient.emit('text:request:completed', {
      ...this.buildTextEventContext(),
      content: this.accumulatedContent,
      messageId: this.currentMessageId || undefined,
      finishReason: this.lastFinishReason || undefined,
      usage: this.finishedEvent?.usage,
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
    this.finishedEvent = null

    const baseContext = this.buildTextEventContext()
    aiEventClient.emit('text:message:created', {
      ...baseContext,
      messageId: this.currentMessageId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
    })
  }

  private async *streamModelResponse(): AsyncGenerator<StreamChunk> {
    const { temperature, topP, maxTokens, metadata, modelOptions } = this.params
    const tools = this.params.tools

    // Convert tool schemas to JSON Schema before passing to adapter
    const toolsWithJsonSchemas = tools?.map((tool) => ({
      ...tool,
      inputSchema: tool.inputSchema
        ? convertSchemaToJsonSchema(tool.inputSchema)
        : undefined,
      outputSchema: tool.outputSchema
        ? convertSchemaToJsonSchema(tool.outputSchema)
        : undefined,
    }))

    for await (const chunk of this.adapter.chatStream({
      model: this.params.model,
      messages: this.messages,
      tools: toolsWithJsonSchemas,
      temperature,
      topP,
      maxTokens,
      metadata,
      request: this.effectiveRequest,
      modelOptions,
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
      // AG-UI Events
      case 'TEXT_MESSAGE_CONTENT':
        this.handleTextMessageContentEvent(chunk)
        break
      case 'TOOL_CALL_START':
        this.handleToolCallStartEvent(chunk)
        break
      case 'TOOL_CALL_ARGS':
        this.handleToolCallArgsEvent(chunk)
        break
      case 'TOOL_CALL_END':
        this.handleToolCallEndEvent(chunk)
        break
      case 'RUN_FINISHED':
        this.handleRunFinishedEvent(chunk)
        break
      case 'RUN_ERROR':
        this.handleRunErrorEvent(chunk)
        break
      case 'STEP_FINISHED':
        this.handleStepFinishedEvent(chunk)
        break

      default:
        // RUN_STARTED, TEXT_MESSAGE_START, TEXT_MESSAGE_END, STEP_STARTED,
        // STATE_SNAPSHOT, STATE_DELTA, CUSTOM
        // - no special handling needed in chat activity
        break
    }
  }

  // ===========================
  // AG-UI Event Handlers
  // ===========================

  private handleTextMessageContentEvent(chunk: TextMessageContentEvent): void {
    if (chunk.content) {
      this.accumulatedContent = chunk.content
    } else {
      this.accumulatedContent += chunk.delta
    }
    aiEventClient.emit('text:chunk:content', {
      ...this.buildTextEventContext(),
      messageId: this.currentMessageId || undefined,
      content: this.accumulatedContent,
      delta: chunk.delta,
      timestamp: Date.now(),
    })
  }

  private handleToolCallStartEvent(chunk: ToolCallStartEvent): void {
    this.toolCallManager.addToolCallStartEvent(chunk)
    aiEventClient.emit('text:chunk:tool-call', {
      ...this.buildTextEventContext(),
      messageId: this.currentMessageId || undefined,
      toolCallId: chunk.toolCallId,
      toolName: chunk.toolName,
      index: chunk.index ?? 0,
      arguments: '',
      timestamp: Date.now(),
    })
  }

  private handleToolCallArgsEvent(chunk: ToolCallArgsEvent): void {
    this.toolCallManager.addToolCallArgsEvent(chunk)
    aiEventClient.emit('text:chunk:tool-call', {
      ...this.buildTextEventContext(),
      messageId: this.currentMessageId || undefined,
      toolCallId: chunk.toolCallId,
      toolName: '',
      index: 0,
      arguments: chunk.delta,
      timestamp: Date.now(),
    })
  }

  private handleToolCallEndEvent(chunk: ToolCallEndEvent): void {
    this.toolCallManager.completeToolCall(chunk)
    aiEventClient.emit('text:chunk:tool-result', {
      ...this.buildTextEventContext(),
      messageId: this.currentMessageId || undefined,
      toolCallId: chunk.toolCallId,
      result: chunk.result || '',
      timestamp: Date.now(),
    })
  }

  private handleRunFinishedEvent(chunk: RunFinishedEvent): void {
    aiEventClient.emit('text:chunk:done', {
      ...this.buildTextEventContext(),
      messageId: this.currentMessageId || undefined,
      finishReason: chunk.finishReason,
      usage: chunk.usage,
      timestamp: Date.now(),
    })

    if (chunk.usage) {
      aiEventClient.emit('text:usage', {
        ...this.buildTextEventContext(),
        messageId: this.currentMessageId || undefined,
        usage: chunk.usage,
        timestamp: Date.now(),
      })
    }

    // Don't overwrite a tool_calls finishReason with a stop finishReason
    if (
      this.finishedEvent?.finishReason === 'tool_calls' &&
      chunk.finishReason === 'stop'
    ) {
      this.lastFinishReason = chunk.finishReason
      return
    }

    this.finishedEvent = chunk
    this.lastFinishReason = chunk.finishReason
  }

  private handleRunErrorEvent(
    chunk: Extract<StreamChunk, { type: 'RUN_ERROR' }>,
  ): void {
    aiEventClient.emit('text:chunk:error', {
      ...this.buildTextEventContext(),
      messageId: this.currentMessageId || undefined,
      error: chunk.error.message,
      timestamp: Date.now(),
    })
    this.earlyTermination = true
    this.shouldEmitStreamEnd = false
  }

  private handleStepFinishedEvent(
    chunk: Extract<StreamChunk, { type: 'STEP_FINISHED' }>,
  ): void {
    // Handle thinking/reasoning content from STEP_FINISHED events
    if (chunk.content || chunk.delta) {
      aiEventClient.emit('text:chunk:thinking', {
        ...this.buildTextEventContext(),
        messageId: this.currentMessageId || undefined,
        content: chunk.content || '',
        delta: chunk.delta,
        timestamp: Date.now(),
      })
    }
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

    const finishEvent = this.createSyntheticFinishedEvent()

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
        finishEvent,
      )) {
        yield chunk
      }

      for (const chunk of this.emitClientToolInputs(
        executionResult.needsClientExecution,
        finishEvent,
      )) {
        yield chunk
      }

      this.shouldEmitStreamEnd = false
      return 'wait'
    }

    const toolResultChunks = this.emitToolResults(
      executionResult.results,
      finishEvent,
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
    const finishEvent = this.finishedEvent

    if (!finishEvent || toolCalls.length === 0) {
      this.setToolPhase('stop')
      return
    }

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
        finishEvent,
      )) {
        yield chunk
      }

      for (const chunk of this.emitClientToolInputs(
        executionResult.needsClientExecution,
        finishEvent,
      )) {
        yield chunk
      }

      this.setToolPhase('wait')
      return
    }

    const toolResultChunks = this.emitToolResults(
      executionResult.results,
      finishEvent,
    )

    for (const chunk of toolResultChunks) {
      yield chunk
    }

    this.toolCallManager.clear()

    this.setToolPhase('continue')
  }

  private shouldExecuteToolPhase(): boolean {
    return (
      this.finishedEvent?.finishReason === 'tool_calls' &&
      this.tools.length > 0 &&
      this.toolCallManager.hasToolCalls()
    )
  }

  private addAssistantToolCallMessage(toolCalls: Array<ToolCall>): void {
    const messageId = this.currentMessageId ?? this.createId('msg')
    this.messages = [
      ...this.messages,
      {
        role: 'assistant',
        content: this.accumulatedContent || null,
        toolCalls,
      },
    ]

    aiEventClient.emit('text:message:created', {
      ...this.buildTextEventContext(),
      messageId,
      role: 'assistant',
      content: this.accumulatedContent || '',
      toolCalls,
      timestamp: Date.now(),
    })
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
    finishEvent: RunFinishedEvent,
  ): Array<StreamChunk> {
    const chunks: Array<StreamChunk> = []

    for (const approval of approvals) {
      aiEventClient.emit('tools:approval:requested', {
        ...this.buildTextEventContext(),
        messageId: this.currentMessageId || undefined,
        toolCallId: approval.toolCallId,
        toolName: approval.toolName,
        input: approval.input,
        approvalId: approval.approvalId,
        timestamp: Date.now(),
      })

      // Emit a CUSTOM event for approval requests
      chunks.push({
        type: 'CUSTOM',
        timestamp: Date.now(),
        model: finishEvent.model,
        name: 'approval-requested',
        data: {
          toolCallId: approval.toolCallId,
          toolName: approval.toolName,
          input: approval.input,
          approval: {
            id: approval.approvalId,
            needsApproval: true,
          },
        },
      })
    }

    return chunks
  }

  private emitClientToolInputs(
    clientRequests: Array<ClientToolRequest>,
    finishEvent: RunFinishedEvent,
  ): Array<StreamChunk> {
    const chunks: Array<StreamChunk> = []

    for (const clientTool of clientRequests) {
      aiEventClient.emit('tools:input:available', {
        ...this.buildTextEventContext(),
        messageId: this.currentMessageId || undefined,
        toolCallId: clientTool.toolCallId,
        toolName: clientTool.toolName,
        input: clientTool.input,
        timestamp: Date.now(),
      })

      // Emit a CUSTOM event for client tool inputs
      chunks.push({
        type: 'CUSTOM',
        timestamp: Date.now(),
        model: finishEvent.model,
        name: 'tool-input-available',
        data: {
          toolCallId: clientTool.toolCallId,
          toolName: clientTool.toolName,
          input: clientTool.input,
        },
      })
    }

    return chunks
  }

  private emitToolResults(
    results: Array<ToolResult>,
    finishEvent: RunFinishedEvent,
  ): Array<StreamChunk> {
    const chunks: Array<StreamChunk> = []

    for (const result of results) {
      aiEventClient.emit('tools:call:completed', {
        ...this.buildTextEventContext(),
        messageId: this.currentMessageId || undefined,
        toolCallId: result.toolCallId,
        toolName: result.toolName,
        result: result.result,
        duration: result.duration ?? 0,
        timestamp: Date.now(),
      })

      const content = JSON.stringify(result.result)

      // Emit TOOL_CALL_END event
      chunks.push({
        type: 'TOOL_CALL_END',
        timestamp: Date.now(),
        model: finishEvent.model,
        toolCallId: result.toolCallId,
        toolName: result.toolName,
        result: content,
      })

      this.messages = [
        ...this.messages,
        {
          role: 'tool',
          content,
          toolCallId: result.toolCallId,
        },
      ]

      aiEventClient.emit('text:message:created', {
        ...this.buildTextEventContext(),
        messageId: this.createId('msg'),
        role: 'tool',
        content,
        timestamp: Date.now(),
      })
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

  private createSyntheticFinishedEvent(): RunFinishedEvent {
    return {
      type: 'RUN_FINISHED',
      runId: this.createId('pending'),
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

  private buildTextEventContext(): {
    requestId: string
    streamId: string
    provider: string
    model: string
    clientId?: string
    source?: 'client' | 'server'
    systemPrompts?: Array<string>
    toolNames?: Array<string>
    options?: Record<string, unknown>
    modelOptions?: Record<string, unknown>
    messageCount: number
    hasTools: boolean
    streaming: boolean
  } {
    return {
      requestId: this.requestId,
      streamId: this.streamId,
      provider: this.adapter.name,
      model: this.params.model,
      clientId: this.params.conversationId,
      source: 'server',
      systemPrompts:
        this.systemPrompts.length > 0 ? this.systemPrompts : undefined,
      toolNames: this.eventToolNames,
      options: this.eventOptions,
      modelOptions: this.params.modelOptions as
        | Record<string, unknown>
        | undefined,
      messageCount: this.initialMessageCount,
      hasTools: this.tools.length > 0,
      streaming: true,
    }
  }

  private getContentString(content: ModelMessage['content']): string {
    if (typeof content === 'string') return content
    const text =
      content
        ?.map((part) => (part.type === 'text' ? part.content : ''))
        .join('') || ''
    return text
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
 * import { chat } from '@tanstack/ai'
 * import { openaiText } from '@tanstack/ai-openai'
 *
 * for await (const chunk of chat({
 *   adapter: openaiText('gpt-4o'),
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
 * for await (const chunk of chat({
 *   adapter: openaiText('gpt-4o'),
 *   messages: [{ role: 'user', content: 'Hello!' }]
 * })) {
 *   console.log(chunk)
 * }
 * ```
 *
 * @example Non-streaming text (stream: false)
 * ```ts
 * const text = await chat({
 *   adapter: openaiText('gpt-4o'),
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
 * const result = await chat({
 *   adapter: openaiText('gpt-4o'),
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
export function chat<
  TAdapter extends AnyTextAdapter,
  TSchema extends SchemaInput | undefined = undefined,
  TStream extends boolean = true,
>(
  options: TextActivityOptions<TAdapter, TSchema, TStream>,
): TextActivityResult<TSchema, TStream> {
  const { outputSchema, stream } = options

  // If outputSchema is provided, run agentic structured output
  if (outputSchema) {
    return runAgenticStructuredOutput(
      options as unknown as TextActivityOptions<
        AnyTextAdapter,
        SchemaInput,
        boolean
      >,
    ) as TextActivityResult<TSchema, TStream>
  }

  // If stream is explicitly false, run non-streaming text
  if (stream === false) {
    return runNonStreamingText(
      options as unknown as TextActivityOptions<
        AnyTextAdapter,
        undefined,
        false
      >,
    ) as TextActivityResult<TSchema, TStream>
  }

  // Otherwise, run streaming text (default)
  return runStreamingText(
    options as unknown as TextActivityOptions<AnyTextAdapter, undefined, true>,
  ) as TextActivityResult<TSchema, TStream>
}

/**
 * Run streaming text (agentic or one-shot depending on tools)
 */
async function* runStreamingText(
  options: TextActivityOptions<AnyTextAdapter, undefined, true>,
): AsyncIterable<StreamChunk> {
  const { adapter, ...textOptions } = options
  const model = adapter.model

  const engine = new TextEngine({
    adapter,
    params: { ...textOptions, model } as TextOptions<
      Record<string, any>,
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
  options: TextActivityOptions<AnyTextAdapter, undefined, false>,
): Promise<string> {
  // Run the streaming text and collect all text using streamToText
  const stream = runStreamingText(
    options as unknown as TextActivityOptions<AnyTextAdapter, undefined, true>,
  )

  return streamToText(stream)
}

/**
 * Run agentic structured output:
 * 1. Execute the full agentic loop (with tools)
 * 2. Once complete, call adapter.structuredOutput with the conversation context
 * 3. Validate and return the structured result
 */
async function runAgenticStructuredOutput<TSchema extends SchemaInput>(
  options: TextActivityOptions<AnyTextAdapter, TSchema, boolean>,
): Promise<InferSchemaType<TSchema>> {
  const { adapter, outputSchema, ...textOptions } = options
  const model = adapter.model

  if (!outputSchema) {
    throw new Error('outputSchema is required for structured output')
  }

  // Create the engine and run the agentic loop
  const engine = new TextEngine({
    adapter,
    params: { ...textOptions, model } as TextOptions<
      Record<string, unknown>,
      Record<string, unknown>
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

  // Convert the schema to JSON Schema before passing to the adapter
  const jsonSchema = convertSchemaToJsonSchema(outputSchema)
  if (!jsonSchema) {
    throw new Error('Failed to convert output schema to JSON Schema')
  }

  // Call the adapter's structured output method with the conversation context
  // The adapter receives JSON Schema and can apply vendor-specific patches
  const result = await adapter.structuredOutput({
    chatOptions: {
      ...structuredTextOptions,
      model,
      messages: finalMessages,
    },
    outputSchema: jsonSchema,
  })

  // Validate the result against the schema if it's a Standard Schema
  if (isStandardSchema(outputSchema)) {
    return parseWithStandardSchema<InferSchemaType<TSchema>>(
      outputSchema,
      result.data,
    )
  }

  // For plain JSON Schema, return the data as-is
  return result.data as InferSchemaType<TSchema>
}

// Re-export adapter types
export type {
  TextAdapter,
  TextAdapterConfig,
  StructuredOutputOptions,
  StructuredOutputResult,
} from './adapter'
export { BaseTextAdapter } from './adapter'
