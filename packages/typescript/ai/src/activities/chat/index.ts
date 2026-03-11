/**
 * Text Activity
 *
 * Handles agentic text generation, one-shot text generation, and agentic structured output.
 * This is a self-contained module with implementation, types, and JSDoc.
 */

import { devtoolsMiddleware } from '@tanstack/ai-event-client'
import { streamToText } from '../../stream-to-response.js'
import {
  MiddlewareAbortError,
  ToolCallManager,
  executeToolCalls,
} from './tools/tool-calls'
import {
  convertSchemaToJsonSchema,
  isStandardSchema,
  parseWithStandardSchema,
} from './tools/schema-converter'
import { maxIterations as maxIterationsStrategy } from './agent-loop-strategies'
import { convertMessagesToModelMessages } from './messages'
import { MiddlewareRunner } from './middleware/compose'
import type {
  ApprovalRequest,
  ClientToolRequest,
  ToolResult,
} from './tools/tool-calls'
import type { AnyTextAdapter } from './adapter'
import type {
  AgentLoopStrategy,
  ConstrainedModelMessage,
  CustomEvent,
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
import type {
  ChatMiddleware,
  ChatMiddlewareConfig,
  ChatMiddlewareContext,
  ChatMiddlewarePhase,
} from './middleware/types'

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
  /**
   * Optional middleware array for observing/transforming chat behavior.
   * Middleware hooks are called in array order. See {@link ChatMiddleware} for available hooks.
   *
   * @example
   * ```ts
   * const stream = chat({
   *   adapter: openaiText('gpt-4o'),
   *   messages: [...],
   *   middleware: [loggingMiddleware, redactionMiddleware],
   * })
   * ```
   */
  middleware?: Array<ChatMiddleware>
  /**
   * Opaque user-provided context value passed to middleware hooks.
   * Can be used to pass request-scoped data (e.g., user ID, request context).
   */
  context?: unknown
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
  middleware?: Array<ChatMiddleware>
  context?: unknown
}

type ToolPhaseResult = 'continue' | 'stop' | 'wait'
type CyclePhase = 'processText' | 'executeToolCalls'

class TextEngine<
  TAdapter extends AnyTextAdapter,
  TParams extends TextOptions<any, any> = TextOptions<any>,
> {
  private readonly adapter: TAdapter
  private params: TParams
  private systemPrompts: Array<string>
  private tools: Array<Tool>
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
  private earlyTermination = false
  private toolPhase: ToolPhaseResult = 'continue'
  private cyclePhase: CyclePhase = 'processText'
  // Client state extracted from initial messages (before conversion to ModelMessage)
  private readonly initialApprovals: Map<string, boolean>
  private readonly initialClientToolResults: Map<string, any>

  // Middleware support
  private readonly middlewareRunner: MiddlewareRunner
  private readonly middlewareCtx: ChatMiddlewareContext
  private readonly deferredPromises: Array<Promise<unknown>> = []
  private abortReason?: string
  private middlewareAbortController?: AbortController
  private terminalHookCalled = false

  constructor(config: TextEngineConfig<TAdapter, TParams>) {
    this.adapter = config.adapter
    this.params = config.params
    this.systemPrompts = config.params.systemPrompts || []
    this.tools = config.params.tools || []
    this.loopStrategy =
      config.params.agentLoopStrategy || maxIterationsStrategy(5)
    this.toolCallManager = new ToolCallManager(this.tools)
    this.initialMessageCount = config.params.messages.length

    // Extract client state (approvals, client tool results) from original messages BEFORE conversion
    // This preserves UIMessage parts data that would be lost during conversion to ModelMessage
    const { approvals, clientToolResults } =
      this.extractClientStateFromOriginalMessages(
        config.params.messages as Array<any>,
      )
    this.initialApprovals = approvals
    this.initialClientToolResults = clientToolResults

    // Convert messages to ModelMessage format (handles both UIMessage and ModelMessage input)
    // This ensures consistent internal format regardless of what the client sends
    this.messages = convertMessagesToModelMessages(
      config.params.messages as Array<any>,
    )
    this.requestId = this.createId('chat')
    this.streamId = this.createId('stream')
    this.effectiveRequest = config.params.abortController
      ? { signal: config.params.abortController.signal }
      : undefined
    this.effectiveSignal = config.params.abortController?.signal

    // Initialize middleware — devtools middleware is always first
    const allMiddleware = [devtoolsMiddleware(), ...(config.middleware || [])]
    this.middlewareRunner = new MiddlewareRunner(allMiddleware)
    this.middlewareAbortController = new AbortController()
    this.middlewareCtx = {
      requestId: this.requestId,
      streamId: this.streamId,
      conversationId: config.params.conversationId,
      phase: 'init' as ChatMiddlewarePhase,
      iteration: 0,
      chunkIndex: 0,
      signal: this.effectiveSignal,
      abort: (reason?: string) => {
        this.abortReason = reason
        this.middlewareAbortController?.abort(reason)
      },
      context: config.context,
      defer: (promise: Promise<unknown>) => {
        this.deferredPromises.push(promise)
      },
      // Provider / adapter info
      provider: config.adapter.name,
      model: config.params.model,
      source: 'server',
      streaming: true,
      // Config-derived (updated in beforeRun and applyMiddlewareConfig)
      systemPrompts: this.systemPrompts,
      toolNames: undefined,
      options: undefined,
      modelOptions: config.params.modelOptions,
      // Computed
      messageCount: this.initialMessageCount,
      hasTools: this.tools.length > 0,
      // Mutable per-iteration
      currentMessageId: null,
      accumulatedContent: '',
      // References
      messages: this.messages,
      createId: (prefix: string) => this.createId(prefix),
    }
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
      // Run initial onConfig (phase = init)
      this.middlewareCtx.phase = 'init'
      const initialConfig = this.buildMiddlewareConfig()
      const transformedConfig = await this.middlewareRunner.runOnConfig(
        this.middlewareCtx,
        initialConfig,
      )
      this.applyMiddlewareConfig(transformedConfig)

      // Run onStart (devtools middleware emits text:request:started and initial messages here)
      await this.middlewareRunner.runOnStart(this.middlewareCtx)

      const pendingPhase = yield* this.checkForPendingToolCalls()
      if (pendingPhase === 'wait') {
        return
      }

      do {
        if (this.earlyTermination || this.isCancelled()) {
          return
        }

        await this.beginCycle()

        if (this.cyclePhase === 'processText') {
          // Run onConfig before each model call (phase = beforeModel)
          this.middlewareCtx.phase = 'beforeModel'
          this.middlewareCtx.iteration = this.iterationCount
          const iterConfig = this.buildMiddlewareConfig()
          const transformedConfig = await this.middlewareRunner.runOnConfig(
            this.middlewareCtx,
            iterConfig,
          )
          this.applyMiddlewareConfig(transformedConfig)

          yield* this.streamModelResponse()
        } else {
          yield* this.processToolCalls()
        }

        this.endCycle()
      } while (this.shouldContinue())

      // Call terminal onFinish hook (skip when waiting for client — stream is paused, not finished)
      if (!this.terminalHookCalled && this.toolPhase !== 'wait') {
        this.terminalHookCalled = true
        await this.middlewareRunner.runOnFinish(this.middlewareCtx, {
          finishReason: this.lastFinishReason,
          duration: Date.now() - this.streamStartTime,
          content: this.accumulatedContent,
          usage: this.finishedEvent?.usage,
        })
      }
    } catch (error: unknown) {
      if (!this.terminalHookCalled) {
        this.terminalHookCalled = true
        if (error instanceof MiddlewareAbortError) {
          // Middleware abort decision — call onAbort, not onError
          this.abortReason = error.message
          await this.middlewareRunner.runOnAbort(this.middlewareCtx, {
            reason: error.message,
            duration: Date.now() - this.streamStartTime,
          })
        } else {
          // Genuine error — call onError
          await this.middlewareRunner.runOnError(this.middlewareCtx, {
            error,
            duration: Date.now() - this.streamStartTime,
          })
        }
      }
      // Don't rethrow middleware abort errors — the run just stops gracefully
      if (!(error instanceof MiddlewareAbortError)) {
        throw error
      }
    } finally {
      // Check for abort terminal hook
      if (!this.terminalHookCalled && this.isCancelled()) {
        this.terminalHookCalled = true
        await this.middlewareRunner.runOnAbort(this.middlewareCtx, {
          reason: this.abortReason,
          duration: Date.now() - this.streamStartTime,
        })
      }

      // Await deferred promises (non-blocking side effects)
      if (this.deferredPromises.length > 0) {
        await Promise.allSettled(this.deferredPromises)
      }
    }
  }

  private beforeRun(): void {
    this.streamStartTime = Date.now()
    const { tools, temperature, topP, maxTokens, metadata } = this.params

    // Gather flattened options into an object for context
    const options: Record<string, unknown> = {}
    if (temperature !== undefined) options.temperature = temperature
    if (topP !== undefined) options.topP = topP
    if (maxTokens !== undefined) options.maxTokens = maxTokens
    if (metadata !== undefined) options.metadata = metadata

    this.eventOptions = Object.keys(options).length > 0 ? options : undefined
    this.eventToolNames = tools?.map((t) => t.name)

    // Update middleware context with computed fields
    this.middlewareCtx.options = this.eventOptions
    this.middlewareCtx.toolNames = this.eventToolNames
  }

  private async beginCycle(): Promise<void> {
    if (this.cyclePhase === 'processText') {
      await this.beginIteration()
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

  private async beginIteration(): Promise<void> {
    this.currentMessageId = this.createId('msg')
    this.accumulatedContent = ''
    this.finishedEvent = null

    // Update mutable context fields
    this.middlewareCtx.currentMessageId = this.currentMessageId
    this.middlewareCtx.accumulatedContent = ''

    // Notify middleware of new iteration (devtools emits assistant message:created here)
    await this.middlewareRunner.runOnIteration(this.middlewareCtx, {
      iteration: this.iterationCount,
      messageId: this.currentMessageId,
    })
  }

  private async *streamModelResponse(): AsyncGenerator<StreamChunk> {
    const { temperature, topP, maxTokens, metadata, modelOptions } = this.params
    const tools = this.tools

    // Convert tool schemas to JSON Schema before passing to adapter
    const toolsWithJsonSchemas = tools.map((tool) => ({
      ...tool,
      inputSchema: tool.inputSchema
        ? convertSchemaToJsonSchema(tool.inputSchema)
        : undefined,
      outputSchema: tool.outputSchema
        ? convertSchemaToJsonSchema(tool.outputSchema)
        : undefined,
    }))

    this.middlewareCtx.phase = 'modelStream'

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
      if (this.isCancelled()) {
        break
      }

      this.totalChunkCount++

      // Pipe chunk through middleware (devtools middleware observes and emits events)
      const outputChunks = await this.middlewareRunner.runOnChunk(
        this.middlewareCtx,
        chunk,
      )
      for (const outputChunk of outputChunks) {
        yield outputChunk
        this.handleStreamChunk(outputChunk)
        this.middlewareCtx.chunkIndex++
      }

      // Handle usage via middleware
      if (chunk.type === 'RUN_FINISHED' && chunk.usage) {
        await this.middlewareRunner.runOnUsage(this.middlewareCtx, chunk.usage)
      }

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
    this.middlewareCtx.accumulatedContent = this.accumulatedContent
  }

  private handleToolCallStartEvent(chunk: ToolCallStartEvent): void {
    this.toolCallManager.addToolCallStartEvent(chunk)
  }

  private handleToolCallArgsEvent(chunk: ToolCallArgsEvent): void {
    this.toolCallManager.addToolCallArgsEvent(chunk)
  }

  private handleToolCallEndEvent(chunk: ToolCallEndEvent): void {
    this.toolCallManager.completeToolCall(chunk)
  }

  private handleRunFinishedEvent(chunk: RunFinishedEvent): void {
    this.finishedEvent = chunk
    this.lastFinishReason = chunk.finishReason
  }

  private handleRunErrorEvent(
    _chunk: Extract<StreamChunk, { type: 'RUN_ERROR' }>,
  ): void {
    this.earlyTermination = true
  }

  private handleStepFinishedEvent(
    _chunk: Extract<StreamChunk, { type: 'STEP_FINISHED' }>,
  ): void {
    // State tracking for STEP_FINISHED is handled by middleware
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

    const generator = executeToolCalls(
      pendingToolCalls,
      this.tools,
      approvals,
      clientToolResults,
      (eventName, data) => this.createCustomEventChunk(eventName, data),
      {
        onBeforeToolCall: async (toolCall, tool, args) => {
          const hookCtx = {
            toolCall,
            tool,
            args,
            toolName: toolCall.function.name,
            toolCallId: toolCall.id,
          }
          return this.middlewareRunner.runOnBeforeToolCall(
            this.middlewareCtx,
            hookCtx,
          )
        },
        onAfterToolCall: async (info) => {
          await this.middlewareRunner.runOnAfterToolCall(
            this.middlewareCtx,
            info,
          )
        },
      },
    )

    // Consume the async generator, yielding custom events and collecting the return value
    const executionResult = yield* this.drainToolCallGenerator(generator)

    // Check if middleware aborted during pending tool execution
    if (this.isMiddlewareAborted()) {
      this.setToolPhase('stop')
      return 'stop'
    }

    // Notify middleware of tool phase completion (devtools emits aggregate events here)
    await this.middlewareRunner.runOnToolPhaseComplete(this.middlewareCtx, {
      toolCalls: pendingToolCalls,
      results: executionResult.results,
      needsApproval: executionResult.needsApproval,
      needsClientExecution: executionResult.needsClientExecution,
    })

    if (
      executionResult.needsApproval.length > 0 ||
      executionResult.needsClientExecution.length > 0
    ) {
      if (executionResult.results.length > 0) {
        for (const chunk of this.buildToolResultChunks(
          executionResult.results,
          finishEvent,
        )) {
          yield chunk
        }
      }

      for (const chunk of this.buildApprovalChunks(
        executionResult.needsApproval,
        finishEvent,
      )) {
        yield chunk
      }

      for (const chunk of this.buildClientToolChunks(
        executionResult.needsClientExecution,
        finishEvent,
      )) {
        yield chunk
      }

      this.setToolPhase('wait')
      return 'wait'
    }

    const toolResultChunks = this.buildToolResultChunks(
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

    this.middlewareCtx.phase = 'beforeTools'

    const { approvals, clientToolResults } = this.collectClientState()

    const generator = executeToolCalls(
      toolCalls,
      this.tools,
      approvals,
      clientToolResults,
      (eventName, data) => this.createCustomEventChunk(eventName, data),
      {
        onBeforeToolCall: async (toolCall, tool, args) => {
          const hookCtx = {
            toolCall,
            tool,
            args,
            toolName: toolCall.function.name,
            toolCallId: toolCall.id,
          }
          return this.middlewareRunner.runOnBeforeToolCall(
            this.middlewareCtx,
            hookCtx,
          )
        },
        onAfterToolCall: async (info) => {
          await this.middlewareRunner.runOnAfterToolCall(
            this.middlewareCtx,
            info,
          )
        },
      },
    )

    // Consume the async generator, yielding custom events and collecting the return value
    const executionResult = yield* this.drainToolCallGenerator(generator)

    this.middlewareCtx.phase = 'afterTools'

    // Check if middleware aborted during tool execution
    if (this.isMiddlewareAborted()) {
      this.setToolPhase('stop')
      return
    }

    // Notify middleware of tool phase completion (devtools emits aggregate events here)
    await this.middlewareRunner.runOnToolPhaseComplete(this.middlewareCtx, {
      toolCalls,
      results: executionResult.results,
      needsApproval: executionResult.needsApproval,
      needsClientExecution: executionResult.needsClientExecution,
    })

    if (
      executionResult.needsApproval.length > 0 ||
      executionResult.needsClientExecution.length > 0
    ) {
      if (executionResult.results.length > 0) {
        for (const chunk of this.buildToolResultChunks(
          executionResult.results,
          finishEvent,
        )) {
          yield chunk
        }
      }

      for (const chunk of this.buildApprovalChunks(
        executionResult.needsApproval,
        finishEvent,
      )) {
        yield chunk
      }

      for (const chunk of this.buildClientToolChunks(
        executionResult.needsClientExecution,
        finishEvent,
      )) {
        yield chunk
      }

      this.setToolPhase('wait')
      return
    }

    const toolResultChunks = this.buildToolResultChunks(
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
    this.messages = [
      ...this.messages,
      {
        role: 'assistant',
        content: this.accumulatedContent || null,
        toolCalls,
      },
    ]
  }

  /**
   * Extract client state (approvals and client tool results) from original messages.
   * This is called in the constructor BEFORE converting to ModelMessage format,
   * because the parts array (which contains approval state) is lost during conversion.
   */
  private extractClientStateFromOriginalMessages(
    originalMessages: Array<any>,
  ): {
    approvals: Map<string, boolean>
    clientToolResults: Map<string, any>
  } {
    const approvals = new Map<string, boolean>()
    const clientToolResults = new Map<string, any>()

    for (const message of originalMessages) {
      // Check for UIMessage format (parts array) - extract client tool results and approvals
      if (message.role === 'assistant' && message.parts) {
        for (const part of message.parts) {
          if (part.type === 'tool-call') {
            // Extract client tool results (tools without approval that have output)
            if (part.output !== undefined && !part.approval) {
              clientToolResults.set(part.id, part.output)
            }
            // Extract approval responses from UIMessage format parts
            if (
              part.approval?.id &&
              part.approval?.approved !== undefined &&
              part.state === 'approval-responded'
            ) {
              approvals.set(part.approval.id, part.approval.approved)
            }
          }
        }
      }
    }

    return { approvals, clientToolResults }
  }

  private collectClientState(): {
    approvals: Map<string, boolean>
    clientToolResults: Map<string, any>
  } {
    // Start with the initial client state extracted from original messages
    const approvals = new Map(this.initialApprovals)
    const clientToolResults = new Map(this.initialClientToolResults)

    // Also check current messages for any additional tool results (from server tools)
    for (const message of this.messages) {
      // Check for ModelMessage format (role: 'tool' messages contain tool results)
      // This handles results sent back from the client after executing client-side tools
      if (message.role === 'tool' && message.toolCallId) {
        // Parse content back to original output (was stringified by uiMessageToModelMessages)
        let output: unknown
        try {
          output = JSON.parse(message.content as string)
        } catch {
          output = message.content
        }
        // Skip approval response messages (they have pendingExecution marker)
        // These are NOT real client tool results — they are synthetic tool messages
        // created by uiMessageToModelMessages for approved-but-not-yet-executed tools.
        // Treating them as results would prevent the server from requesting actual
        // client-side execution after approval (see GitHub issue #225).
        if (
          output &&
          typeof output === 'object' &&
          (output as any).pendingExecution === true
        ) {
          continue
        }
        clientToolResults.set(message.toolCallId, output)
      }
    }

    return { approvals, clientToolResults }
  }

  private buildApprovalChunks(
    approvals: Array<ApprovalRequest>,
    finishEvent: RunFinishedEvent,
  ): Array<StreamChunk> {
    const chunks: Array<StreamChunk> = []

    for (const approval of approvals) {
      chunks.push({
        type: 'CUSTOM',
        timestamp: Date.now(),
        model: finishEvent.model,
        name: 'approval-requested',
        value: {
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

  private buildClientToolChunks(
    clientRequests: Array<ClientToolRequest>,
    finishEvent: RunFinishedEvent,
  ): Array<StreamChunk> {
    const chunks: Array<StreamChunk> = []

    for (const clientTool of clientRequests) {
      chunks.push({
        type: 'CUSTOM',
        timestamp: Date.now(),
        model: finishEvent.model,
        name: 'tool-input-available',
        value: {
          toolCallId: clientTool.toolCallId,
          toolName: clientTool.toolName,
          input: clientTool.input,
        },
      })
    }

    return chunks
  }

  private buildToolResultChunks(
    results: Array<ToolResult>,
    finishEvent: RunFinishedEvent,
  ): Array<StreamChunk> {
    const chunks: Array<StreamChunk> = []

    for (const result of results) {
      const content = JSON.stringify(result.result)

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
    }

    return chunks
  }

  private getPendingToolCallsFromMessages(): Array<ToolCall> {
    // Build a set of completed tool IDs, but exclude tools with pendingExecution marker
    // (these are approved tools that still need to execute)
    const completedToolIds = new Set<string>()

    for (const message of this.messages) {
      if (message.role === 'tool' && message.toolCallId) {
        // Check if this is an approval response with pendingExecution marker
        let hasPendingExecution = false
        if (typeof message.content === 'string') {
          try {
            const parsed = JSON.parse(message.content)
            if (parsed.pendingExecution === true) {
              hasPendingExecution = true
            }
          } catch {
            // Not JSON, treat as regular tool result
          }
        }

        // Only mark as complete if NOT pending execution
        if (!hasPendingExecution) {
          completedToolIds.add(message.toolCallId)
        }
      }
    }

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

  private isMiddlewareAborted(): boolean {
    return !!this.middlewareAbortController?.signal.aborted
  }

  private isCancelled(): boolean {
    return this.isAborted() || this.isMiddlewareAborted()
  }

  private buildMiddlewareConfig(): ChatMiddlewareConfig {
    return {
      messages: this.messages,
      systemPrompts: [...this.systemPrompts],
      tools: [...this.tools],
      temperature: this.params.temperature,
      topP: this.params.topP,
      maxTokens: this.params.maxTokens,
      metadata: this.params.metadata,
      modelOptions: this.params.modelOptions,
    }
  }

  private applyMiddlewareConfig(config: ChatMiddlewareConfig): void {
    this.messages = config.messages
    this.systemPrompts = config.systemPrompts
    this.tools = config.tools
    this.params = {
      ...this.params,
      temperature: config.temperature,
      topP: config.topP,
      maxTokens: config.maxTokens,
      metadata: config.metadata,
      modelOptions: config.modelOptions,
    }

    // Sync context fields that depend on config
    this.middlewareCtx.messages = this.messages
    this.middlewareCtx.systemPrompts = this.systemPrompts
    this.middlewareCtx.hasTools = this.tools.length > 0
    this.middlewareCtx.toolNames = this.tools.map((t) => t.name)
    this.middlewareCtx.modelOptions = config.modelOptions
  }

  private setToolPhase(phase: ToolPhaseResult): void {
    this.toolPhase = phase
  }

  /**
   * Drain an executeToolCalls async generator, yielding any CustomEvent chunks
   * and returning the final ExecuteToolCallsResult.
   */
  private async *drainToolCallGenerator(
    generator: AsyncGenerator<
      CustomEvent,
      {
        results: Array<ToolResult>
        needsApproval: Array<ApprovalRequest>
        needsClientExecution: Array<ClientToolRequest>
      },
      void
    >,
  ): AsyncGenerator<
    StreamChunk,
    {
      results: Array<ToolResult>
      needsApproval: Array<ApprovalRequest>
      needsClientExecution: Array<ClientToolRequest>
    },
    void
  > {
    let next = await generator.next()
    while (!next.done) {
      yield next.value
      next = await generator.next()
    }
    return next.value
  }

  private createCustomEventChunk(
    eventName: string,
    value: Record<string, any>,
  ): CustomEvent {
    return {
      type: 'CUSTOM',
      timestamp: Date.now(),
      model: this.params.model,
      name: eventName,
      value,
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
  const { adapter, middleware, context, ...textOptions } = options
  const model = adapter.model

  const engine = new TextEngine({
    adapter,
    params: { ...textOptions, model } as TextOptions<
      Record<string, any>,
      Record<string, any>
    >,
    middleware,
    context,
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
  const { adapter, outputSchema, middleware, context, ...textOptions } = options
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
    middleware,
    context,
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
