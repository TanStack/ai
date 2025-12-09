import {
  trace,
  context,
  SpanKind,
  SpanStatusCode,
  type Span,
  type Tracer,
} from '@opentelemetry/api'
import { aiEventClient } from '@tanstack/ai/event-client'
import { GenAIAttributes, type TanStackAIInstrumentationConfig } from './types'

const VERSION = '0.0.3'

/**
 * Manages active spans for correlation across events
 */
class SpanRegistry {
  private chat_spans = new Map<string, Span>()
  private stream_spans = new Map<string, Span>()
  private tool_spans = new Map<string, Span>()

  setChatSpan(request_id: string, span: Span): void {
    this.chat_spans.set(request_id, span)
  }

  getChatSpan(request_id: string): Span | undefined {
    return this.chat_spans.get(request_id)
  }

  deleteChatSpan(request_id: string): void {
    this.chat_spans.delete(request_id)
  }

  setStreamSpan(stream_id: string, span: Span): void {
    this.stream_spans.set(stream_id, span)
  }

  getStreamSpan(stream_id: string): Span | undefined {
    return this.stream_spans.get(stream_id)
  }

  deleteStreamSpan(stream_id: string): void {
    this.stream_spans.delete(stream_id)
  }

  setToolSpan(tool_call_id: string, span: Span): void {
    this.tool_spans.set(tool_call_id, span)
  }

  getToolSpan(tool_call_id: string): Span | undefined {
    return this.tool_spans.get(tool_call_id)
  }

  deleteToolSpan(tool_call_id: string): void {
    this.tool_spans.delete(tool_call_id)
  }
}

/**
 * TanStack AI OpenTelemetry Instrumentation
 *
 * Subscribes to aiEventClient events and creates OpenTelemetry spans
 * following GenAI semantic conventions.
 */
export class TanStackAIInstrumentation {
  private tracer: Tracer
  private config: TanStackAIInstrumentationConfig
  private registry = new SpanRegistry()
  private cleanup_functions: Array<() => void> = []
  private enabled = false

  constructor(config: TanStackAIInstrumentationConfig = {}) {
    this.config = {
      tracerName: '@tanstack/ai',
      tracerVersion: VERSION,
      recordContent: false,
      recordToolCalls: true,
      attributePrefix: 'gen_ai',
      ...config,
    }

    this.tracer =
      config.tracer ??
      trace.getTracer(
        this.config.tracerName!,
        this.config.tracerVersion,
      )
  }

  /**
   * Enable the instrumentation and start listening to events
   */
  enable(): void {
    if (this.enabled) {
      return
    }

    this.enabled = true
    this.subscribeToEvents()
  }

  /**
   * Disable the instrumentation and stop listening to events
   */
  disable(): void {
    if (!this.enabled) {
      return
    }

    this.enabled = false
    for (const cleanup of this.cleanup_functions) {
      cleanup()
    }
    this.cleanup_functions = []
  }

  private subscribeToEvents(): void {
    // Chat lifecycle events
    this.cleanup_functions.push(
      aiEventClient.on(
        'chat:started',
        (event) => this.onChatStarted(event.payload),
        { withEventTarget: true },
      ),
    )

    this.cleanup_functions.push(
      aiEventClient.on(
        'chat:completed',
        (event) => this.onChatCompleted(event.payload),
        { withEventTarget: true },
      ),
    )

    this.cleanup_functions.push(
      aiEventClient.on(
        'chat:iteration',
        (event) => this.onChatIteration(event.payload),
        { withEventTarget: true },
      ),
    )

    // Stream events
    this.cleanup_functions.push(
      aiEventClient.on(
        'stream:started',
        (event) => this.onStreamStarted(event.payload),
        { withEventTarget: true },
      ),
    )

    this.cleanup_functions.push(
      aiEventClient.on(
        'stream:ended',
        (event) => this.onStreamEnded(event.payload),
        { withEventTarget: true },
      ),
    )

    this.cleanup_functions.push(
      aiEventClient.on(
        'stream:chunk:error',
        (event) => this.onStreamError(event.payload),
        { withEventTarget: true },
      ),
    )

    // Tool events
    this.cleanup_functions.push(
      aiEventClient.on(
        'stream:chunk:tool-call',
        (event) => this.onToolCallStarted(event.payload),
        { withEventTarget: true },
      ),
    )

    this.cleanup_functions.push(
      aiEventClient.on(
        'tool:call-completed',
        (event) => this.onToolCallCompleted(event.payload),
        { withEventTarget: true },
      ),
    )

    // Usage events
    this.cleanup_functions.push(
      aiEventClient.on(
        'usage:tokens',
        (event) => this.onUsageTokens(event.payload),
        { withEventTarget: true },
      ),
    )
  }

  private onChatStarted(event: {
    requestId: string
    streamId: string
    provider: string
    model: string
    messageCount: number
    hasTools: boolean
    streaming: boolean
    timestamp: number
    clientId?: string
    toolNames?: Array<string>
  }): void {
    const span = this.tracer.startSpan(
      `chat ${event.model}`,
      {
        kind: SpanKind.CLIENT,
        startTime: new Date(event.timestamp),
        attributes: {
          [GenAIAttributes.SYSTEM]: event.provider,
          [GenAIAttributes.REQUEST_MODEL]: event.model,
          [GenAIAttributes.TANSTACK_REQUEST_ID]: event.requestId,
          [GenAIAttributes.TANSTACK_STREAM_ID]: event.streamId,
          [GenAIAttributes.TANSTACK_MESSAGE_COUNT]: event.messageCount,
          [GenAIAttributes.TANSTACK_HAS_TOOLS]: event.hasTools,
          [GenAIAttributes.TANSTACK_STREAMING]: event.streaming,
          ...(event.clientId && {
            [GenAIAttributes.TANSTACK_CLIENT_ID]: event.clientId,
          }),
          ...(event.toolNames && {
            'gen_ai.request.tool_names': event.toolNames.join(','),
          }),
        },
      },
    )

    this.registry.setChatSpan(event.requestId, span)
  }

  private onChatCompleted(event: {
    requestId: string
    streamId: string
    model: string
    content: string
    messageId?: string
    finishReason?: string
    usage?: {
      promptTokens: number
      completionTokens: number
      totalTokens: number
    }
    timestamp: number
  }): void {
    const span = this.registry.getChatSpan(event.requestId)
    if (!span) {
      return
    }

    span.setAttributes({
      [GenAIAttributes.RESPONSE_MODEL]: event.model,
      ...(event.finishReason && {
        [GenAIAttributes.RESPONSE_FINISH_REASONS]: event.finishReason,
      }),
      ...(event.usage && {
        [GenAIAttributes.USAGE_INPUT_TOKENS]: event.usage.promptTokens,
        [GenAIAttributes.USAGE_OUTPUT_TOKENS]: event.usage.completionTokens,
        [GenAIAttributes.USAGE_TOTAL_TOKENS]: event.usage.totalTokens,
      }),
    })

    if (this.config.recordContent && event.content) {
      span.setAttribute('gen_ai.response.content', event.content)
    }

    span.setStatus({ code: SpanStatusCode.OK })
    span.end(new Date(event.timestamp))
    this.registry.deleteChatSpan(event.requestId)
  }

  private onChatIteration(event: {
    requestId: string
    streamId: string
    iterationNumber: number
    messageCount: number
    toolCallCount: number
    timestamp: number
  }): void {
    const parent_span = this.registry.getChatSpan(event.requestId)
    if (!parent_span) {
      return
    }

    // Create a child span for this iteration
    const parent_context = trace.setSpan(context.active(), parent_span)
    const iteration_span = this.tracer.startSpan(
      `iteration ${event.iterationNumber}`,
      {
        kind: SpanKind.INTERNAL,
        startTime: new Date(event.timestamp),
        attributes: {
          [GenAIAttributes.TANSTACK_ITERATION]: event.iterationNumber,
          [GenAIAttributes.TANSTACK_MESSAGE_COUNT]: event.messageCount,
          [GenAIAttributes.TANSTACK_TOOL_COUNT]: event.toolCallCount,
        },
      },
      parent_context,
    )

    // End iteration span immediately (it's a point-in-time event)
    iteration_span.end(new Date(event.timestamp))
  }

  private onStreamStarted(event: {
    streamId: string
    model: string
    provider: string
    timestamp: number
  }): void {
    const span = this.tracer.startSpan(
      `stream ${event.model}`,
      {
        kind: SpanKind.INTERNAL,
        startTime: new Date(event.timestamp),
        attributes: {
          [GenAIAttributes.SYSTEM]: event.provider,
          [GenAIAttributes.REQUEST_MODEL]: event.model,
          [GenAIAttributes.TANSTACK_STREAM_ID]: event.streamId,
        },
      },
    )

    this.registry.setStreamSpan(event.streamId, span)
  }

  private onStreamEnded(event: {
    requestId: string
    streamId: string
    totalChunks: number
    duration: number
    timestamp: number
  }): void {
    const span = this.registry.getStreamSpan(event.streamId)
    if (!span) {
      return
    }

    span.setAttributes({
      'tanstack_ai.stream.total_chunks': event.totalChunks,
      'tanstack_ai.stream.duration_ms': event.duration,
    })

    span.setStatus({ code: SpanStatusCode.OK })
    span.end(new Date(event.timestamp))
    this.registry.deleteStreamSpan(event.streamId)
  }

  private onStreamError(event: {
    streamId: string
    messageId?: string
    error: string
    timestamp: number
  }): void {
    const span = this.registry.getStreamSpan(event.streamId)
    if (!span) {
      return
    }

    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: event.error,
    })
    span.recordException(new Error(event.error))
  }

  private onToolCallStarted(event: {
    streamId: string
    messageId?: string
    toolCallId: string
    toolName: string
    index: number
    arguments: string
    timestamp: number
  }): void {
    if (!this.config.recordToolCalls) {
      return
    }

    const parent_span = this.registry.getStreamSpan(event.streamId)
    const parent_context = parent_span
      ? trace.setSpan(context.active(), parent_span)
      : context.active()

    const span = this.tracer.startSpan(
      `tool ${event.toolName}`,
      {
        kind: SpanKind.INTERNAL,
        startTime: new Date(event.timestamp),
        attributes: {
          [GenAIAttributes.TOOL_NAME]: event.toolName,
          [GenAIAttributes.TOOL_CALL_ID]: event.toolCallId,
          'gen_ai.tool.index': event.index,
        },
      },
      parent_context,
    )

    if (this.config.recordContent && event.arguments) {
      span.setAttribute('gen_ai.tool.arguments', event.arguments)
    }

    this.registry.setToolSpan(event.toolCallId, span)
  }

  private onToolCallCompleted(event: {
    requestId: string
    streamId: string
    messageId?: string
    toolCallId: string
    toolName: string
    result: unknown
    duration: number
    timestamp: number
  }): void {
    if (!this.config.recordToolCalls) {
      return
    }

    const span = this.registry.getToolSpan(event.toolCallId)
    if (!span) {
      return
    }

    span.setAttributes({
      'gen_ai.tool.duration_ms': event.duration,
    })

    if (this.config.recordContent && event.result !== undefined) {
      span.setAttribute(
        'gen_ai.tool.result',
        typeof event.result === 'string'
          ? event.result
          : JSON.stringify(event.result),
      )
    }

    span.setStatus({ code: SpanStatusCode.OK })
    span.end(new Date(event.timestamp))
    this.registry.deleteToolSpan(event.toolCallId)
  }

  private onUsageTokens(event: {
    requestId: string
    streamId: string
    model: string
    messageId?: string
    usage: {
      promptTokens: number
      completionTokens: number
      totalTokens: number
    }
    timestamp: number
  }): void {
    const span = this.registry.getChatSpan(event.requestId)
    if (!span) {
      return
    }

    span.setAttributes({
      [GenAIAttributes.USAGE_INPUT_TOKENS]: event.usage.promptTokens,
      [GenAIAttributes.USAGE_OUTPUT_TOKENS]: event.usage.completionTokens,
      [GenAIAttributes.USAGE_TOTAL_TOKENS]: event.usage.totalTokens,
    })
  }
}

// Singleton instance for convenience
let default_instrumentation: TanStackAIInstrumentation | null = null

/**
 * Enable OpenTelemetry instrumentation for TanStack AI
 *
 * @example
 * ```typescript
 * import { enableOpenTelemetry } from '@tanstack/ai-opentelemetry'
 *
 * // Use global tracer provider
 * enableOpenTelemetry()
 *
 * // Or provide custom tracer
 * enableOpenTelemetry({
 *   tracer: myTracer,
 *   recordContent: true, // Record prompt/response content
 * })
 * ```
 */
export function enableOpenTelemetry(
  config?: TanStackAIInstrumentationConfig,
): TanStackAIInstrumentation {
  if (default_instrumentation) {
    default_instrumentation.disable()
  }

  default_instrumentation = new TanStackAIInstrumentation(config)
  default_instrumentation.enable()

  return default_instrumentation
}

/**
 * Disable the default OpenTelemetry instrumentation
 */
export function disableOpenTelemetry(): void {
  if (default_instrumentation) {
    default_instrumentation.disable()
    default_instrumentation = null
  }
}
