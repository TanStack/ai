import {
  SpanKind,
  SpanStatusCode,
  context as otelContext,
  trace as otelTrace,
} from '@opentelemetry/api'
import type {
  AttributeValue,
  Exception,
  Meter,
  Span,
  SpanOptions,
  Tracer,
} from '@opentelemetry/api'
import type {
  ChatMiddleware,
  ChatMiddlewareContext,
} from '../activities/chat/middleware/types'

/**
 * Scope (role) of an OTel span emitted by this middleware.
 *
 * - `chat` — the root span for a single `chat()` call
 * - `iteration` — one per agent-loop iteration (one model call)
 * - `tool` — one per tool execution inside an iteration
 */
export type OtelSpanScope = 'chat' | 'iteration' | 'tool'

/**
 * Alias retained for backwards compatibility. Prefer {@link OtelSpanScope}.
 *
 * @deprecated Use `OtelSpanScope` instead — the name shadows OTel's built-in
 * `SpanKind` which is also imported by integrations of this middleware.
 */
export type OtelSpanKind = OtelSpanScope

/**
 * Span metadata passed to `spanNameFormatter`, `attributeEnricher`,
 * `onBeforeSpanStart`, and `onSpanEnd`. Discriminated by `kind` so that
 * tool-only fields narrow automatically inside callback bodies.
 */
export type OtelSpanInfo<TScope extends OtelSpanScope = OtelSpanScope> =
  TScope extends 'chat'
    ? { kind: 'chat'; ctx: ChatMiddlewareContext }
    : TScope extends 'iteration'
      ? { kind: 'iteration'; ctx: ChatMiddlewareContext; iteration: number }
      : TScope extends 'tool'
        ? {
            kind: 'tool'
            ctx: ChatMiddlewareContext
            iteration: number
            toolName: string
            toolCallId: string
          }
        : never

export interface OtelMiddlewareOptions {
  /** OTel `Tracer` used to start root, iteration, and tool spans. */
  tracer: Tracer
  /**
   * Optional OTel `Meter`. When provided, the middleware records
   * `gen_ai.client.operation.duration` and `gen_ai.client.token.usage`
   * histograms. Omit to disable metrics without disabling tracing.
   */
  meter?: Meter
  /**
   * When `true`, prompt and completion content is attached to iteration spans
   * as `gen_ai.*.message` / `gen_ai.choice` events. Defaults to `false` so
   * that PII never lands on a span by accident.
   */
  captureContent?: boolean
  /**
   * Invoked on every captured content string before it lands on a span.
   * Return a redacted version. If this function throws, the middleware emits
   * the literal sentinel `"[redaction_failed]"` instead of the original text
   * — it never falls back to raw content.
   */
  redact?: (text: string) => string
  /**
   * Maximum characters kept in the per-iteration assistant text buffer used
   * to emit `gen_ai.choice` events. Extra characters are truncated with a
   * trailing `"…"` marker. Defaults to 100 000. Set to `0` to disable the
   * cap. Exporters typically truncate long attribute values anyway.
   */
  maxContentLength?: number
  /** Override the default span name for each `kind`. */
  spanNameFormatter?: (info: OtelSpanInfo) => string
  /** Add extra attributes to each span. */
  attributeEnricher?: (info: OtelSpanInfo) => Record<string, AttributeValue>
  /** Mutate `SpanOptions` immediately before `tracer.startSpan(...)`. */
  onBeforeSpanStart?: (info: OtelSpanInfo, options: SpanOptions) => SpanOptions
  /** Fires just before every `span.end()`. */
  onSpanEnd?: (info: OtelSpanInfo, span: Span) => void
}

interface RequestState {
  rootSpan: Span
  currentIterationSpan: Span | null
  toolSpans: Map<string, { span: Span; toolName: string }>
  iterationCount: number
  assistantTextBuffer: string
  assistantTextBufferTruncated: boolean
  startTime: number
}

const stateByCtx = new WeakMap<ChatMiddlewareContext, RequestState>()

const DEFAULT_MAX_CONTENT_LENGTH = 100_000
const REDACTION_FAILED_SENTINEL = '[redaction_failed]'

function serializeContent(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  const parts: Array<string> = []
  for (const part of content) {
    if (!part || typeof part !== 'object') continue
    const type = (part as { type?: string }).type
    switch (type) {
      case 'text':
        parts.push(
          (
            (part as { text?: string }).text ??
            (part as { content?: string }).content ??
            ''
          ).toString(),
        )
        break
      case 'image':
        parts.push('[image]')
        break
      case 'audio':
        parts.push('[audio]')
        break
      case 'video':
        parts.push('[video]')
        break
      case 'document':
        parts.push('[document]')
        break
      default:
        parts.push(`[${type ?? 'unknown'}]`)
    }
  }
  return parts.join(' ')
}

function messageEventName(role: string): string {
  switch (role) {
    case 'user':
      return 'gen_ai.user.message'
    case 'assistant':
      return 'gen_ai.assistant.message'
    case 'tool':
      return 'gen_ai.tool.message'
    case 'system':
      return 'gen_ai.system.message'
    default:
      return `gen_ai.${role}.message`
  }
}

function errorMessage(err: unknown): string | undefined {
  if (err instanceof Error) return err.message
  if (typeof err === 'string') return err
  if (err && typeof err === 'object' && 'message' in err) {
    const m = (err as { message?: unknown }).message
    if (typeof m === 'string') return m
  }
  return undefined
}

function errorTypeName(err: unknown): string {
  if (err instanceof Error) return err.name || 'Error'
  if (err && typeof err === 'object' && 'name' in err) {
    const n = (err as { name?: unknown }).name
    if (typeof n === 'string') return n
  }
  return 'Error'
}

function safeCall<T>(label: string, fn: () => T): T | undefined {
  try {
    return fn()
  } catch (err) {
    // Keep middleware non-fatal, but surface callback failures so that broken
    // extension points (attributeEnricher, spanNameFormatter, onSpanEnd, ...)
    // are observable. Matches the guarantee documented in docs/advanced/otel.md.
    console.warn(`[otelMiddleware] ${label} failed`, err)
    return undefined
  }
}

export function otelMiddleware(options: OtelMiddlewareOptions): ChatMiddleware {
  const {
    tracer,
    meter,
    captureContent = false,
    redact = (s) => s,
    maxContentLength = DEFAULT_MAX_CONTENT_LENGTH,
    spanNameFormatter,
    attributeEnricher,
    onBeforeSpanStart,
    onSpanEnd,
  } = options

  const durationHistogram = meter?.createHistogram(
    'gen_ai.client.operation.duration',
    {
      description: 'GenAI client operation duration',
      unit: 's',
    },
  )
  const tokenHistogram = meter?.createHistogram('gen_ai.client.token.usage', {
    description: 'GenAI client token usage',
    unit: '{token}',
  })

  // Redact user content, failing closed to a sentinel string instead of ever
  // letting raw text through. Callers that pass `captureContent: true` with a
  // third-party PII redactor depend on this invariant.
  const redactContent = (text: string): string => {
    try {
      return redact(text)
    } catch (err) {
      console.warn('[otelMiddleware] otel.redact failed', err)
      return REDACTION_FAILED_SENTINEL
    }
  }

  const appendAssistantText = (state: RequestState, delta: string): void => {
    if (maxContentLength > 0) {
      if (state.assistantTextBufferTruncated) return
      const remaining = maxContentLength - state.assistantTextBuffer.length
      if (remaining <= 0) {
        state.assistantTextBufferTruncated = true
        state.assistantTextBuffer += '…'
        return
      }
      if (delta.length > remaining) {
        state.assistantTextBuffer += delta.slice(0, remaining) + '…'
        state.assistantTextBufferTruncated = true
        return
      }
    }
    state.assistantTextBuffer += delta
  }

  const closeIterationSpan = (
    state: RequestState,
    ctx: ChatMiddlewareContext,
  ): void => {
    if (!state.currentIterationSpan) return
    const span = state.currentIterationSpan
    const iteration = state.iterationCount - 1
    safeCall('otel.onSpanEnd', () =>
      onSpanEnd?.(
        { kind: 'iteration', ctx, iteration } as OtelSpanInfo<'iteration'>,
        span,
      ),
    )
    span.end()
    state.currentIterationSpan = null
  }

  return {
    name: 'otel',

    onStart(ctx) {
      safeCall('otel.onStart', () => {
        const info: OtelSpanInfo<'chat'> = { kind: 'chat', ctx }
        const name =
          safeCall('otel.spanNameFormatter', () => spanNameFormatter?.(info)) ??
          `chat ${ctx.model}`
        const baseOptions: SpanOptions = {
          kind: SpanKind.INTERNAL,
          attributes: {
            'gen_ai.system': ctx.provider,
            'gen_ai.request.model': ctx.model,
            // NOTE: `gen_ai.operation.name` is deliberately NOT set on the
            // root span. The root represents a `chat()` invocation that may
            // span multiple model calls; only iteration spans correspond to
            // a single chat operation. Backends that map `operation.name=chat`
            // to a "generation" event (e.g. PostHog LLM Analytics) would
            // otherwise emit a duplicate generation for the wrapper span.
          },
        }
        const spanOptions =
          safeCall('otel.onBeforeSpanStart', () =>
            onBeforeSpanStart?.(info, baseOptions),
          ) ?? baseOptions
        const rootSpan = tracer.startSpan(name, spanOptions)

        const enriched = safeCall('otel.attributeEnricher', () =>
          attributeEnricher?.(info),
        )
        if (enriched) rootSpan.setAttributes(enriched)

        stateByCtx.set(ctx, {
          rootSpan,
          currentIterationSpan: null,
          toolSpans: new Map(),
          iterationCount: 0,
          assistantTextBuffer: '',
          assistantTextBufferTruncated: false,
          startTime: Date.now(),
        })
      })
    },

    onConfig(ctx, config) {
      if (ctx.phase !== 'beforeModel') return
      safeCall('otel.onConfig', () => {
        const state = stateByCtx.get(ctx)
        if (!state) return

        // The previous iteration's span stays open through tool execution and
        // onUsage so that tool spans nest under it and token attributes land
        // on it. Close it here, just before opening the next iteration.
        closeIterationSpan(state, ctx)

        const info: OtelSpanInfo<'iteration'> = {
          kind: 'iteration',
          ctx,
          iteration: ctx.iteration,
        }
        const name =
          safeCall('otel.spanNameFormatter', () => spanNameFormatter?.(info)) ??
          `chat ${ctx.model} #${ctx.iteration}`

        const baseAttrs: Record<string, AttributeValue> = {
          'gen_ai.system': ctx.provider,
          'gen_ai.operation.name': 'chat',
          'gen_ai.request.model': ctx.model,
          'tanstack.ai.iteration': ctx.iteration,
        }
        if (config.temperature !== undefined)
          baseAttrs['gen_ai.request.temperature'] = config.temperature
        if (config.topP !== undefined)
          baseAttrs['gen_ai.request.top_p'] = config.topP
        if (config.maxTokens !== undefined)
          baseAttrs['gen_ai.request.max_tokens'] = config.maxTokens

        const baseOptions: SpanOptions = {
          kind: SpanKind.CLIENT,
          attributes: baseAttrs,
        }
        const spanOptions =
          safeCall('otel.onBeforeSpanStart', () =>
            onBeforeSpanStart?.(info, baseOptions),
          ) ?? baseOptions

        const parentCtx = otelTrace.setSpan(
          otelContext.active(),
          state.rootSpan,
        )
        let iterSpan!: Span
        otelContext.with(parentCtx, () => {
          // Pass the parent context explicitly as the 3rd arg — this is a
          // real-OTel-compatible way to ensure the span is parented to
          // `rootSpan` even when the host app has not registered a context
          // manager (e.g. in tests or minimal setups).
          iterSpan = tracer.startSpan(name, spanOptions, parentCtx)
        })

        const enriched = safeCall('otel.attributeEnricher', () =>
          attributeEnricher?.(info),
        )
        if (enriched) iterSpan.setAttributes(enriched)

        state.currentIterationSpan = iterSpan
        state.assistantTextBuffer = ''
        state.assistantTextBufferTruncated = false

        if (captureContent) {
          // Span events follow the original GenAI semconv (one event per
          // message). Backends that read events get content this way.
          for (const sys of config.systemPrompts) {
            iterSpan.addEvent('gen_ai.system.message', {
              content: redactContent(sys),
            })
          }
          for (const m of config.messages) {
            const body = serializeContent(m.content)
            if (body.length === 0) continue
            iterSpan.addEvent(messageEventName(m.role), {
              content: redactContent(body),
            })
          }

          // Also emit the current GenAI-semconv attribute form
          // (`gen_ai.input.messages`) — backends like PostHog read prompt
          // content from this attribute, not from span events.
          const inputMessages: Array<{ role: string; content: string }> = []
          for (const sys of config.systemPrompts) {
            inputMessages.push({
              role: 'system',
              content: redactContent(sys),
            })
          }
          for (const m of config.messages) {
            const body = serializeContent(m.content)
            if (body.length === 0) continue
            inputMessages.push({
              role: m.role,
              content: redactContent(body),
            })
          }
          if (inputMessages.length > 0) {
            const inputJson = JSON.stringify(inputMessages)
            // Current OTel GenAI semconv — Sentry / PostHog / Datadog read
            // prompt content from this attribute.
            iterSpan.setAttribute('gen_ai.input.messages', inputJson)
            // Langfuse-native attribute. Highest priority in Langfuse's OTLP
            // ingestion (checked before events and gen_ai.input.messages) so
            // the Input panel populates reliably. Harmless to other backends —
            // the attribute is namespaced and unrecognised keys are ignored.
            iterSpan.setAttribute('langfuse.observation.input', inputJson)

            // Mirror the first iteration's input onto the root span and at
            // trace level so Langfuse fills Input on the trace card and the
            // chat-level observation. Later iterations append tool-call /
            // assistant messages that are useful per-iteration but noise at
            // the chat / trace level.
            if (state.iterationCount === 0) {
              state.rootSpan.setAttribute(
                'langfuse.observation.input',
                inputJson,
              )
              state.rootSpan.setAttribute('langfuse.trace.input', inputJson)
            }
          }
        }

        state.iterationCount += 1
      })
      return undefined
    },

    onChunk(ctx, chunk) {
      safeCall('otel.onChunk', () => {
        const state = stateByCtx.get(ctx)
        if (!state) return

        if (captureContent && chunk.type === 'TEXT_MESSAGE_CONTENT') {
          appendAssistantText(state, chunk.delta)
        }

        if (chunk.type !== 'RUN_FINISHED') return
        const span = state.currentIterationSpan
        if (!span) return

        if (chunk.finishReason) {
          span.setAttribute('gen_ai.response.finish_reasons', [
            chunk.finishReason,
          ])
        }
        if (chunk.model) span.setAttribute('gen_ai.response.model', chunk.model)

        // Set usage attributes on the iteration span directly from the chunk
        // so they're available before `onUsage` fires. Histogram recording is
        // deliberately NOT done here — the chat runner always invokes
        // `runOnUsage` when `chunk.usage` is present, and `onUsage` is the
        // canonical place for the metric. Recording in both would double-count.
        if (chunk.usage) {
          span.setAttributes({
            'gen_ai.usage.input_tokens': chunk.usage.promptTokens,
            'gen_ai.usage.output_tokens': chunk.usage.completionTokens,
          })
        }

        if (captureContent && state.assistantTextBuffer.length > 0) {
          const completion = redactContent(state.assistantTextBuffer)
          const outputJson = JSON.stringify([
            { role: 'assistant', content: completion },
          ])
          // Event form (older semconv) — kept for backends that consume it.
          span.addEvent('gen_ai.choice', { content: completion })
          // Attribute form (current semconv) — required by backends like
          // PostHog that read completion content from `gen_ai.output.messages`.
          span.setAttribute('gen_ai.output.messages', outputJson)
          // Langfuse-native attribute (highest priority in Langfuse mapping).
          span.setAttribute('langfuse.observation.output', outputJson)
          // Mirror to the root span and trace card. Each iteration overwrites,
          // so the final iteration's completion lands on the root — which is
          // the final answer the user saw, not an intermediate tool-call turn.
          state.rootSpan.setAttribute('langfuse.observation.output', outputJson)
          state.rootSpan.setAttribute('langfuse.trace.output', outputJson)
          state.assistantTextBuffer = ''
          state.assistantTextBufferTruncated = false
        }

        // Intentionally leave the iteration span open: tool spans started
        // after `RUN_FINISHED` (tool_calls finishReason) must nest under it,
        // and `onUsage` may still fire. The span is closed in `onConfig` when
        // the next iteration starts, or in `onFinish` / `onError` / `onAbort`.
      })
      return undefined
    },

    onUsage(ctx, usage) {
      safeCall('otel.onUsage', () => {
        const state = stateByCtx.get(ctx)
        if (!state) return

        // Always record the token histogram — metrics don't depend on having
        // an iteration span, and skipping here would drop metric data if an
        // adapter emits `onUsage` outside the iteration window.
        if (tokenHistogram) {
          const metricAttrs = {
            'gen_ai.system': ctx.provider,
            'gen_ai.operation.name': 'chat',
            'gen_ai.request.model': ctx.model,
          }
          tokenHistogram.record(usage.promptTokens, {
            ...metricAttrs,
            'gen_ai.token.type': 'input',
          })
          tokenHistogram.record(usage.completionTokens, {
            ...metricAttrs,
            'gen_ai.token.type': 'output',
          })
        }

        const span = state.currentIterationSpan ?? state.rootSpan
        span.setAttributes({
          'gen_ai.usage.input_tokens': usage.promptTokens,
          'gen_ai.usage.output_tokens': usage.completionTokens,
        })
      })
    },

    onBeforeToolCall(ctx, hookCtx) {
      safeCall('otel.onBeforeToolCall', () => {
        const state = stateByCtx.get(ctx)
        if (!state) return
        const parent = state.currentIterationSpan ?? state.rootSpan

        const info: OtelSpanInfo<'tool'> = {
          kind: 'tool',
          ctx,
          toolName: hookCtx.toolName,
          toolCallId: hookCtx.toolCallId,
          iteration: state.iterationCount - 1,
        }
        const name =
          safeCall('otel.spanNameFormatter', () => spanNameFormatter?.(info)) ??
          `execute_tool ${hookCtx.toolName}`

        const baseAttrs: Record<string, AttributeValue> = {
          'gen_ai.tool.name': hookCtx.toolName,
          'gen_ai.tool.call.id': hookCtx.toolCallId,
          'gen_ai.tool.type': 'function',
        }
        const baseOptions: SpanOptions = {
          kind: SpanKind.INTERNAL,
          attributes: baseAttrs,
        }
        const spanOptions =
          safeCall('otel.onBeforeSpanStart', () =>
            onBeforeSpanStart?.(info, baseOptions),
          ) ?? baseOptions

        const parentCtx = otelTrace.setSpan(otelContext.active(), parent)
        let toolSpan!: Span
        otelContext.with(parentCtx, () => {
          toolSpan = tracer.startSpan(name, spanOptions, parentCtx)
        })

        const enriched = safeCall('otel.attributeEnricher', () =>
          attributeEnricher?.(info),
        )
        if (enriched) toolSpan.setAttributes(enriched)

        // Stamp the tool args onto the tool span so backends that render an
        // input panel per span (e.g. PostHog) have something to show.
        if (captureContent) {
          const argsBody =
            typeof hookCtx.args === 'string'
              ? hookCtx.args
              : (safeCall('otel.serializeToolArgs', () =>
                  JSON.stringify(hookCtx.args ?? null),
                ) ?? '[unserializable_tool_args]')
          const redactedArgs = redactContent(argsBody)
          const toolInputJson = JSON.stringify([
            { role: 'tool', content: redactedArgs },
          ])
          toolSpan.setAttribute('gen_ai.input.messages', toolInputJson)
          // Langfuse-native (highest priority in Langfuse mapping).
          toolSpan.setAttribute('langfuse.observation.input', toolInputJson)
        }

        state.toolSpans.set(hookCtx.toolCallId, {
          span: toolSpan,
          toolName: hookCtx.toolName,
        })
      })
      return undefined
    },

    onAfterToolCall(ctx, info) {
      safeCall('otel.onAfterToolCall', () => {
        const state = stateByCtx.get(ctx)
        if (!state) return
        const entry = state.toolSpans.get(info.toolCallId)
        if (!entry) return
        const { span: toolSpan } = entry

        const outcome = info.ok ? 'success' : 'error'
        toolSpan.setAttribute('tanstack.ai.tool.outcome', outcome)

        if (!info.ok && info.error !== undefined) {
          toolSpan.recordException(info.error as Exception)
          toolSpan.setStatus({
            code: SpanStatusCode.ERROR,
            message: errorMessage(info.error),
          })
        }

        if (captureContent) {
          // Serialization can throw on circular refs or `BigInt` values. If it
          // does, fall back to a sentinel so the rest of this handler (span
          // end, onSpanEnd, toolSpans cleanup) still runs — otherwise the tool
          // span would dangle until the onFinish/onError sweep.
          const body =
            typeof info.result === 'string'
              ? info.result
              : (safeCall('otel.serializeToolResult', () =>
                  JSON.stringify(info.result ?? null),
                ) ?? '[unserializable_tool_result]')
          const redactedBody = redactContent(body)
          if (state.currentIterationSpan) {
            state.currentIterationSpan.addEvent('gen_ai.tool.message', {
              content: redactedBody,
              tool_call_id: info.toolCallId,
            })
          }
          // Output panel of the tool span itself — `gen_ai.output.messages` is
          // what current GenAI semconv consumers (e.g. PostHog) read.
          const toolOutputJson = JSON.stringify([
            { role: 'tool', content: redactedBody },
          ])
          toolSpan.setAttribute('gen_ai.output.messages', toolOutputJson)
          // Langfuse-native (highest priority in Langfuse mapping).
          toolSpan.setAttribute('langfuse.observation.output', toolOutputJson)
        }

        safeCall('otel.onSpanEnd', () =>
          onSpanEnd?.(
            {
              kind: 'tool',
              ctx,
              toolName: info.toolName,
              toolCallId: info.toolCallId,
              iteration: state.iterationCount - 1,
            } as OtelSpanInfo<'tool'>,
            toolSpan,
          ),
        )
        toolSpan.end()
        state.toolSpans.delete(info.toolCallId)
      })
    },

    onError(ctx, info) {
      safeCall('otel.onError', () => {
        const state = stateByCtx.get(ctx)
        if (!state) return

        const errType = errorTypeName(info.error)
        const message = errorMessage(info.error)
        const exception = info.error as Exception

        if (state.currentIterationSpan) {
          state.currentIterationSpan.recordException(exception)
          state.currentIterationSpan.setStatus({
            code: SpanStatusCode.ERROR,
            message,
          })
          safeCall('otel.onSpanEnd', () =>
            onSpanEnd?.(
              {
                kind: 'iteration',
                ctx,
                iteration: state.iterationCount - 1,
              } as OtelSpanInfo<'iteration'>,
              state.currentIterationSpan!,
            ),
          )
          state.currentIterationSpan.end()
          state.currentIterationSpan = null
        }

        for (const [id, entry] of state.toolSpans) {
          const { span, toolName } = entry
          span.recordException(exception)
          span.setStatus({ code: SpanStatusCode.ERROR, message })
          safeCall('otel.onSpanEnd', () =>
            onSpanEnd?.(
              {
                kind: 'tool',
                ctx,
                toolCallId: id,
                toolName,
                iteration: state.iterationCount - 1,
              } as OtelSpanInfo<'tool'>,
              span,
            ),
          )
          span.end()
          state.toolSpans.delete(id)
        }

        state.rootSpan.recordException(exception)
        state.rootSpan.setStatus({ code: SpanStatusCode.ERROR, message })

        if (durationHistogram) {
          durationHistogram.record(info.duration / 1000, {
            'gen_ai.system': ctx.provider,
            'gen_ai.operation.name': 'chat',
            'gen_ai.request.model': ctx.model,
            'error.type': errType,
          })
        }

        safeCall('otel.onSpanEnd', () =>
          onSpanEnd?.({ kind: 'chat', ctx }, state.rootSpan),
        )
        state.rootSpan.end()
        stateByCtx.delete(ctx)
      })
    },

    onAbort(ctx, info) {
      safeCall('otel.onAbort', () => {
        const state = stateByCtx.get(ctx)
        if (!state) return

        const closeCancelled = (span: Span): void => {
          // `gen_ai.completion.reason` is not part of the GenAI semconv; use a
          // TanStack-namespaced attribute so downstream exporters don't treat
          // it as standard. The span status still carries the error code.
          span.setAttribute('tanstack.ai.completion.reason', 'cancelled')
          span.setStatus({ code: SpanStatusCode.ERROR, message: 'cancelled' })
        }

        if (state.currentIterationSpan) {
          closeCancelled(state.currentIterationSpan)
          safeCall('otel.onSpanEnd', () =>
            onSpanEnd?.(
              {
                kind: 'iteration',
                ctx,
                iteration: state.iterationCount - 1,
              } as OtelSpanInfo<'iteration'>,
              state.currentIterationSpan!,
            ),
          )
          state.currentIterationSpan.end()
          state.currentIterationSpan = null
        }
        for (const [id, entry] of state.toolSpans) {
          const { span, toolName } = entry
          closeCancelled(span)
          safeCall('otel.onSpanEnd', () =>
            onSpanEnd?.(
              {
                kind: 'tool',
                ctx,
                toolCallId: id,
                toolName,
                iteration: state.iterationCount - 1,
              } as OtelSpanInfo<'tool'>,
              span,
            ),
          )
          span.end()
          state.toolSpans.delete(id)
        }
        closeCancelled(state.rootSpan)

        if (durationHistogram) {
          durationHistogram.record(info.duration / 1000, {
            'gen_ai.system': ctx.provider,
            'gen_ai.operation.name': 'chat',
            'gen_ai.request.model': ctx.model,
            'error.type': 'cancelled',
          })
        }

        safeCall('otel.onSpanEnd', () =>
          onSpanEnd?.({ kind: 'chat', ctx }, state.rootSpan),
        )
        state.rootSpan.end()
        stateByCtx.delete(ctx)
      })
    },

    onFinish(ctx, info) {
      safeCall('otel.onFinish', () => {
        const state = stateByCtx.get(ctx)
        if (!state) return

        // Close any tool spans that never received `onAfterToolCall` (adapter
        // quirk). Done before the iteration span so the hierarchy is closed
        // in depth-first order.
        for (const [id, entry] of state.toolSpans) {
          const { span, toolName } = entry
          span.setAttribute('tanstack.ai.tool.outcome', 'unknown')
          safeCall('otel.onSpanEnd', () =>
            onSpanEnd?.(
              {
                kind: 'tool',
                ctx,
                toolCallId: id,
                toolName,
                iteration: state.iterationCount - 1,
              } as OtelSpanInfo<'tool'>,
              span,
            ),
          )
          span.end()
          state.toolSpans.delete(id)
        }

        // The final iteration's span is still open because we keep it open
        // through tool execution and `onUsage`. Close it now.
        closeIterationSpan(state, ctx)

        if (durationHistogram) {
          durationHistogram.record(info.duration / 1000, {
            'gen_ai.system': ctx.provider,
            'gen_ai.operation.name': 'chat',
            'gen_ai.request.model': ctx.model,
          })
        }

        if (info.usage) {
          state.rootSpan.setAttributes({
            'gen_ai.usage.input_tokens': info.usage.promptTokens,
            'gen_ai.usage.output_tokens': info.usage.completionTokens,
          })
        }
        if (info.finishReason) {
          state.rootSpan.setAttribute('gen_ai.response.finish_reasons', [
            info.finishReason,
          ])
        }
        state.rootSpan.setAttribute(
          'tanstack.ai.iterations',
          state.iterationCount,
        )

        safeCall('otel.onSpanEnd', () =>
          onSpanEnd?.({ kind: 'chat', ctx }, state.rootSpan),
        )
        state.rootSpan.end()
        stateByCtx.delete(ctx)
      })
    },
  }
}
