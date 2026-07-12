import { createFileRoute } from '@tanstack/react-router'
import { chat, createChatOptions, toolDefinition } from '@tanstack/ai'
import { otelMiddleware } from '@tanstack/ai/middlewares/otel'
import { createOpenaiChatCompletions } from '@tanstack/ai-openai'
import { createOpenRouterText } from '@tanstack/ai-openrouter'
import { z } from 'zod'
import { createTextAdapter } from '@/lib/providers'
import type {
  AttributeValue,
  Context,
  Span,
  SpanContext,
  Tracer,
} from '@opentelemetry/api'

const LLMOCK_DEFAULT_BASE = process.env.LLMOCK_URL || 'http://127.0.0.1:4010'
const DUMMY_KEY = 'sk-e2e-test-dummy-key'
const weatherTool = toolDefinition({
  name: 'get_weather',
  description: 'Get weather',
  inputSchema: z.object({ city: z.string() }),
}).server(async ({ city }) => ({ city, temperature: 72, condition: 'sunny' }))

interface CapturedSpan {
  name: string
  kind?: number
  attributes: Record<string, AttributeValue>
  ended: boolean
}

/**
 * Single-request in-memory tracer. Unlike the per-testId capture in
 * `api.middleware-test.ts`, everything here happens inside one POST, so spans
 * collect into a local array returned directly in the response body.
 */
function createLocalCaptureTracer(): {
  tracer: Tracer
  spans: Array<CapturedSpan>
} {
  const spans: Array<CapturedSpan> = []
  let spanSeq = 0
  const tracer: Tracer = {
    startSpan(name, options = {}, _ctx?: Context): Span {
      const id = `span-${spanSeq++}`
      const attributes: Record<string, AttributeValue> = {}
      for (const [k, v] of Object.entries(options.attributes ?? {})) {
        if (v !== undefined) attributes[k] = v as AttributeValue
      }
      const captured: CapturedSpan = {
        name,
        kind: options.kind,
        attributes,
        ended: false,
      }
      spans.push(captured)
      const span: Span = {
        spanContext(): SpanContext {
          return { traceId: 'otel-usage-trace', spanId: id, traceFlags: 1 }
        },
        setAttribute(key, value) {
          captured.attributes[key] = value as AttributeValue
          return span
        },
        setAttributes(next) {
          for (const [k, v] of Object.entries(next)) {
            captured.attributes[k] = v as AttributeValue
          }
          return span
        },
        addEvent() {
          return span
        },
        addLink() {
          return span
        },
        addLinks() {
          return span
        },
        setStatus() {
          return span
        },
        updateName(next) {
          captured.name = next
          return span
        },
        end() {
          captured.ended = true
        },
        isRecording() {
          return !captured.ended
        },
        recordException() {},
      }
      return span
    },
    // Minimal implementation — otelMiddleware never calls startActiveSpan.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    startActiveSpan(...args: Array<any>) {
      const fn = args[args.length - 1] as (span: Span) => unknown
      const name = args[0] as string
      const span = tracer.startSpan(name, {})
      try {
        return fn(span)
      } finally {
        span.end()
      }
    },
  }
  return { tracer, spans }
}

/**
 * Drives a chat adapter with `otelMiddleware` against the existing
 * hand-crafted aimock mounts that report rich usage, and returns the captured
 * spans. Companion E2E proof for full-usage span emission (#721):
 *
 * - `provider: 'openai'` → `/openai-usage-details` mount, whose trailing usage
 *   chunk carries `total_tokens`, `prompt_tokens_details.cached_tokens`, and
 *   `completion_tokens_details.reasoning_tokens`.
 * - `provider: 'openrouter'` → `/openrouter-cost` mount, whose trailing usage
 *   chunk carries `cost` / `cost_details`.
 *
 * The spec asserts the corresponding `gen_ai.usage.*` / `tanstack.ai.usage.*`
 * attributes land on the iteration and root spans.
 */
export const Route = createFileRoute('/api/otel-usage')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let provider = 'openai'
        let testId: string | undefined
        try {
          const body = (await request.json()) as {
            provider?: string
            testId?: string
          }
          if (typeof body.provider === 'string') provider = body.provider
          if (typeof body.testId === 'string') testId = body.testId
        } catch {
          // No/invalid body — default provider.
        }

        const adapter =
          provider === 'tool-loop'
            ? createTextAdapter('openai', undefined, undefined, testId).adapter
            : provider === 'openrouter'
              ? createOpenRouterText('openai/gpt-4o', DUMMY_KEY, {
                  serverURL: `${LLMOCK_DEFAULT_BASE}/openrouter-cost/v1`,
                })
              : createOpenaiChatCompletions('gpt-4o', DUMMY_KEY, {
                  baseURL: `${LLMOCK_DEFAULT_BASE}/openai-usage-details/v1`,
                })

        const { tracer, spans } = createLocalCaptureTracer()

        try {
          for await (const _chunk of chat({
            ...createChatOptions({ adapter }),
            messages: [
              {
                role: 'user',
                content:
                  provider === 'tool-loop' ? '[with-tool] run test' : 'hi',
              },
            ],
            ...(provider === 'tool-loop' ? { tools: [weatherTool] } : {}),
            middleware: [otelMiddleware({ tracer })],
          })) {
            // Drain — the assertions live on the captured spans.
          }
        } catch (error) {
          return new Response(
            JSON.stringify({
              ok: false,
              error: error instanceof Error ? error.message : String(error),
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          )
        }

        return new Response(JSON.stringify({ ok: true, spans }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      },
    },
  },
})
