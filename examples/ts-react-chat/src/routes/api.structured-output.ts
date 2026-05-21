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

/**
 * Synthetic suffixes the dropdown uses to opt the route into reasoning
 * modes that aren't first-class on the wire (e.g. "Opus 4.7 with max
 * adaptive thinking"). The suffix is stripped before reaching the
 * adapter. Currently `:thinking-max` is the only one defined.
 */
function stripModelSuffix(model: string | undefined): string | undefined {
  if (!model) return model
  const colonIdx = model.indexOf(':')
  return colonIdx === -1 ? model : model.slice(0, colonIdx)
}

function adapterFor(provider: Provider, model?: string): AnyTextAdapter {
  const baseModel = stripModelSuffix(model)
  switch (provider) {
    case 'openai':
      return openaiText((baseModel || 'gpt-5.2') as 'gpt-5.2')
    case 'openai-chat':
      // Same model surface as the Responses adapter, but talks to
      // `/v1/chat/completions`. Useful for side-by-side comparison of
      // streaming structured output across the two OpenAI wire formats.
      return openaiChatCompletions((baseModel || 'gpt-4o') as 'gpt-4o')
    case 'anthropic':
      // Claude 4.5+ supports native combined tools + schema-constrained
      // streaming (#605) via `output_config.format` on the beta Messages
      // endpoint. Earlier models fall back to the forced-tool-use
      // workaround in `structuredOutput` (no real streaming).
      return anthropicText(
        (baseModel || 'claude-sonnet-4-5') as 'claude-sonnet-4-5',
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
    case 'anthropic': {
      // Default: thinking OFF. Demo flows that just want streaming
      // structured output shouldn't pay for reasoning tokens, and 4.7
      // adaptive thinking can easily blow the default `max_tokens` budget
      // before the schema-constrained JSON finishes — leaving the user
      // staring at "response was cut off". The dropdown opts back in via
      // the synthetic `:thinking-max` suffix.
      const baseModel = stripModelSuffix(model)
      if (
        !baseModel ||
        !ANTHROPIC_COMBINED_TOOLS_AND_SCHEMA_MODELS.has(baseModel)
      ) {
        return undefined
      }
      const wantsThinking = model?.endsWith(':thinking-max') === true
      if (!wantsThinking) return undefined

      // Three 4.7-specific quirks (only relevant on the thinking variant):
      //   1. Manual extended thinking (`type: 'enabled'` + `budget_tokens`)
      //      is rejected with HTTP 400 — adaptive is the only supported
      //      mode.
      //   2. The default for `display` flipped from `'summarized'` (4.6)
      //      to `'omitted'` (4.7). Without `display: 'summarized'` the
      //      API still streams a thinking content block but only emits
      //      `signature_delta`, no `thinking_delta` — empty reasoning
      //      panel even when the model IS thinking.
      //   3. Adaptive thinking is non-deterministic. The model decides
      //      based on prompt complexity. For short prompts like the demo
      //      `'high'` still skipped thinking; only `'max'` reliably
      //      engages it (and even that's not a hard guarantee).
      if (baseModel.startsWith('claude-opus-4-7')) {
        return {
          thinking: { type: 'adaptive', display: 'summarized' },
          output_config: { effort: 'max' },
        }
      }
      // 4.5 / 4.6 / haiku 4.5 still accept the legacy
      // `type: 'enabled' + budget_tokens` shape.
      return { thinking: { type: 'enabled', budget_tokens: 1024 } }
    }
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

          // Adaptive thinking on Claude 4.7 can chew through a few thousand
          // tokens before the schema-constrained JSON even starts. The
          // adapter's default `max_tokens` (1024) was producing truncated
          // outputs ("response was cut off"). Bump for the
          // `:thinking-max` variant so the reasoning + JSON both fit. We
          // keep the budget modest (16k) for everyone else to avoid
          // surprising bills on the demo.
          const wantsAnthropicMaxThinking =
            resolvedProvider === 'anthropic' &&
            model?.endsWith(':thinking-max') === true
          const maxTokens = wantsAnthropicMaxThinking ? 16_000 : undefined

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
              ...(maxTokens !== undefined && { maxTokens }),
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
            ...(maxTokens !== undefined && { maxTokens }),
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
