import { createFileRoute } from '@tanstack/react-router'
import { chat, toServerSentEventsResponse } from '@tanstack/ai'
import { openaiChatCompletions, openaiText } from '@tanstack/ai-openai'
import {
  ANTHROPIC_COMBINED_TOOLS_AND_SCHEMA_MODELS,
  anthropicText,
} from '@tanstack/ai-anthropic'
import { grokText } from '@tanstack/ai-grok'
import { groqText } from '@tanstack/ai-groq'
import {
  openRouterResponsesText,
  openRouterText,
} from '@tanstack/ai-openrouter'
import { z } from 'zod'
import type { AnyTextAdapter, ChatMiddleware, StreamChunk } from '@tanstack/ai'
import { EventType } from '@tanstack/ai'

/**
 * Diagnostic middleware that records which middleware phases observed chunks.
 * Used here to verify PR #600 — middleware should now see chunks attributed
 * to `phase === 'structuredOutput'` during the final structured-output call.
 *
 * Counts are exposed via:
 *   - the JSON response (`_diagnostics` field) for non-streaming
 *   - a trailing CUSTOM `phase-counts` event for streaming
 */
function phaseCounterMiddleware(): {
  middleware: ChatMiddleware
  snapshot: () => Record<string, number>
} {
  const counts: Record<string, number> = {}
  return {
    middleware: {
      name: 'phase-counter',
      onChunk(ctx) {
        counts[ctx.phase] = (counts[ctx.phase] ?? 0) + 1
      },
    },
    snapshot: () => ({ ...counts }),
  }
}

/**
 * Wrap a chat stream so it emits a trailing CUSTOM `phase-counts` event
 * right before terminating, carrying the counter middleware's snapshot.
 */
async function* withTrailingPhaseCounts(
  stream: AsyncIterable<StreamChunk>,
  snapshot: () => Record<string, number>,
  model: string,
): AsyncIterable<StreamChunk> {
  for await (const chunk of stream) {
    yield chunk
  }
  yield {
    type: EventType.CUSTOM,
    name: 'phase-counts',
    value: snapshot(),
    model,
    timestamp: Date.now(),
  }
}

const GuitarRecommendationSchema = z.object({
  title: z.string().describe('Short headline for the recommendation'),
  summary: z.string().describe('One paragraph summary'),
  recommendations: z
    .array(
      z.object({
        name: z.string(),
        brand: z.string(),
        type: z.enum(['acoustic', 'electric', 'bass', 'classical']),
        priceRangeUsd: z.object({ min: z.number(), max: z.number() }),
        reason: z.string(),
      }),
    )
    .min(1)
    .describe('Guitar recommendations with reasons'),
  nextSteps: z.array(z.string()).describe('Practical follow-up actions'),
})

type Provider =
  | 'openai'
  | 'openai-chat'
  | 'anthropic'
  | 'grok'
  | 'groq'
  | 'openrouter'
  | 'openrouter-responses'

const StructuredOutputRequestSchema = z.object({
  prompt: z.string().min(1),
  provider: z
    .enum([
      'openai',
      'openai-chat',
      'anthropic',
      'grok',
      'groq',
      'openrouter',
      'openrouter-responses',
    ])
    .optional(),
  model: z.string().optional(),
  stream: z.boolean().optional(),
})

function adapterFor(provider: Provider, model?: string): AnyTextAdapter {
  switch (provider) {
    case 'openai':
      return openaiText((model || 'gpt-5.2') as 'gpt-5.2')
    case 'openai-chat':
      // Same model surface as the Responses adapter, but talks to
      // `/v1/chat/completions`. Useful for side-by-side comparison of
      // streaming structured output across the two OpenAI wire formats.
      return openaiChatCompletions((model || 'gpt-4o') as 'gpt-4o')
    case 'anthropic':
      // Claude 4.5+ supports native combined tools + schema-constrained
      // streaming (#605) via `output_format` on the beta Messages endpoint.
      // Earlier models fall back to the forced-tool-use workaround in
      // `structuredOutput` (no real streaming).
      return anthropicText(
        (model || 'claude-sonnet-4-5') as 'claude-sonnet-4-5',
      )
    case 'grok':
      return grokText(
        (model || 'grok-4-1-fast-reasoning') as 'grok-4-1-fast-reasoning',
      )
    case 'groq':
      return groqText(
        (model ||
          'meta-llama/llama-4-maverick-17b-128e-instruct') as 'meta-llama/llama-4-maverick-17b-128e-instruct',
      )
    case 'openrouter':
      return openRouterText(
        (model || 'anthropic/claude-opus-4.6') as 'anthropic/claude-opus-4.6',
      )
    case 'openrouter-responses':
      // OpenRouter Responses (beta) endpoint — same model surface as the
      // chat-completions adapter, but routes through `/v1/responses`. This
      // is what exercises `OpenRouterResponsesTextAdapter.structuredOutputStream`.
      return openRouterResponsesText(
        (model || 'anthropic/claude-opus-4.6') as 'anthropic/claude-opus-4.6',
      )
  }
}

// Per-provider modelOptions to opt into reasoning surfacing. Without these,
// reasoning models reason silently and the UI never sees REASONING_* events.
function reasoningOptionsFor(
  provider: Provider,
  model: string | undefined,
): Record<string, unknown> | undefined {
  switch (provider) {
    case 'openai':
      // Responses API: `reasoning.summary: 'auto'` is what makes the API emit
      // `response.reasoning_summary_text.delta` events. Only valid on
      // reasoning models (gpt-5.x, o-series); older models (gpt-4o) reject it.
      if (
        model?.startsWith('gpt-5') ||
        model?.startsWith('o3') ||
        model?.startsWith('o4')
      ) {
        return { reasoning: { summary: 'auto' } }
      }
      return undefined
    case 'openai-chat':
      // Chat Completions API doesn't surface reasoning summaries the way
      // Responses does. Reasoning models still reason silently; no opt-in
      // option to inject here.
      return undefined
    case 'anthropic':
      // Claude extended thinking surfaces via REASONING_* events when
      // enabled. Gating *strictly* to combined-mode-capable models matters:
      // enabling thinking on a legacy-path model triggers the engine's
      // forced-tool-use finalization workaround, which the API rejects with
      // "Thinking may not be enabled when tool_choice forces tool use".
      //
      // The thinking API itself changed between Claude generations:
      //   • 4.5 / 4.6 / 4.6-fast / haiku 4.5:
      //       `thinking: { type: 'enabled', budget_tokens }`
      //   • 4.7 / 4.7-fast (and 4.6+ adaptive-capable):
      //       `thinking: { type: 'adaptive' }` paired with
      //       `output_config.effort`. The API explicitly rejects
      //       `type: 'enabled'` on 4.7 with
      //       "thinking.type.enabled is not supported for this model.
      //        Use thinking.type.adaptive and output_config.effort."
      if (!model || !ANTHROPIC_COMBINED_TOOLS_AND_SCHEMA_MODELS.has(model)) {
        return undefined
      }
      if (model.startsWith('claude-opus-4-7')) {
        // Two 4.7-specific quirks vs 4.5/4.6:
        //
        //   1. Manual extended thinking (`type: 'enabled'` + `budget_tokens`)
        //      is rejected with HTTP 400 — adaptive is the only supported
        //      mode.
        //   2. The default for `display` flipped from `'summarized'` (on
        //      4.6) to `'omitted'` (on 4.7). Without `display: 'summarized'`
        //      the API still streams a thinking content block but only
        //      emits `signature_delta` events, no `thinking_delta` — so the
        //      reasoning panel stays empty even when the model IS thinking.
        //
        // `effort: 'high'` keeps "Claude will almost always think" so the
        // demo reliably shows the streaming reasoning surface.
        return {
          thinking: { type: 'adaptive', display: 'summarized' },
          output_config: { effort: 'high' },
        }
      }
      return { thinking: { type: 'enabled', budget_tokens: 1024 } }
    case 'groq':
      // Groq's Chat Completions only streams `delta.reasoning` when
      // `reasoning_format: 'parsed'`. Required for gpt-oss / qwen3 / kimi-k2
      // to emit reasoning during structured output (json_schema mode).
      if (
        model?.startsWith('openai/gpt-oss') ||
        model?.startsWith('qwen') ||
        model?.startsWith('moonshotai/kimi')
      ) {
        return { reasoning_format: 'parsed' }
      }
      return undefined
    case 'openrouter':
    case 'openrouter-responses':
      // OpenRouter normalises across providers. `reasoning.effort` triggers
      // the upstream model's reasoning + surfaces the deltas. Same option on
      // both the chat-completions and Responses-beta endpoints.
      return { reasoning: { effort: 'medium' } }
    case 'grok':
      // xAI surfaces `delta.reasoning_content` automatically on reasoning
      // models (grok-3-mini, grok-4-fast-reasoning, grok-4-1-fast-reasoning).
      // No request param needed.
      return undefined
  }
}

export const Route = createFileRoute('/api/structured-output')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const parsed = StructuredOutputRequestSchema.safeParse(
            await request.json(),
          )
          if (!parsed.success) {
            return new Response(
              JSON.stringify({ error: 'Invalid request body' }),
              {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
              },
            )
          }
          const { prompt, provider, model, stream } = parsed.data
          const resolvedProvider: Provider = provider || 'openrouter'
          const modelOptions = reasoningOptionsFor(resolvedProvider, model)

          const counter = phaseCounterMiddleware()

          if (stream) {
            const abortController = new AbortController()
            request.signal.addEventListener('abort', () =>
              abortController.abort(),
            )
            const adapter = adapterFor(resolvedProvider, model)
            const streamIterable = chat({
              adapter,
              modelOptions: modelOptions as never,
              messages: [{ role: 'user', content: prompt }],
              outputSchema: GuitarRecommendationSchema,
              stream: true,
              middleware: [counter.middleware],
              abortController,
            }) as AsyncIterable<StreamChunk>
            const withCounts = withTrailingPhaseCounts(
              streamIterable,
              counter.snapshot,
              adapter.model,
            )
            return toServerSentEventsResponse(withCounts, {
              abortController,
            })
          }

          const abortController = new AbortController()
          request.signal.addEventListener('abort', () =>
            abortController.abort(),
          )
          const result = await chat({
            adapter: adapterFor(resolvedProvider, model),
            modelOptions: modelOptions as never,
            messages: [{ role: 'user', content: prompt }],
            outputSchema: GuitarRecommendationSchema,
            middleware: [counter.middleware],
            abortController,
          })

          return new Response(
            JSON.stringify({
              data: result,
              _diagnostics: { phaseCounts: counter.snapshot() },
            }),
            {
              headers: { 'Content-Type': 'application/json' },
            },
          )
        } catch (error: unknown) {
          const message =
            error instanceof Error ? error.message : 'An error occurred'
          console.error('[api/structured-output] Error:', error)
          return new Response(JSON.stringify({ error: message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          })
        }
      },
    },
  },
})
