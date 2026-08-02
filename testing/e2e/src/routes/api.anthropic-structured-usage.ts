import { createFileRoute } from '@tanstack/react-router'
import { chat, createChatOptions } from '@tanstack/ai'
import { createAnthropicChat } from '@tanstack/ai-anthropic'
import { z } from 'zod'

const LLMOCK_DEFAULT_BASE = process.env.LLMOCK_URL || 'http://127.0.0.1:4010'
const DUMMY_KEY = 'sk-e2e-test-dummy-key'

/**
 * Drives the Anthropic text adapter (`AnthropicTextAdapter`) through the
 * streaming structured-output path. That adapter has no native
 * `structuredOutputStream`, so `chat({ outputSchema, stream: true })` routes
 * through the activity layer's `fallbackStructuredOutputStream`, which wraps the
 * non-streaming `structuredOutput()`. The mounted `/anthropic-structured-usage`
 * aimock path returns a tool-forced `structured_output` response whose `usage`
 * carries `input_tokens` / `output_tokens` / `cache_read_input_tokens`.
 *
 * Regression for #758: before the fix the fallback dropped `result.usage`, so
 * `RUN_FINISHED.usage` was `undefined` on every fallback-path provider. The
 * companion spec asserts the usage now reaches `RUN_FINISHED.usage`.
 */
export const Route = createFileRoute('/api/anthropic-structured-usage')({
  server: {
    handlers: {
      POST: async () => {
        // `claude-opus-4-1` is intentionally a *pre-4.5* model: it is NOT in
        // `ANTHROPIC_COMBINED_TOOLS_AND_SCHEMA_MODELS`, so
        // `supportsCombinedToolsAndSchema()` is false and the engine routes
        // `chat({ outputSchema, stream: true })` through the non-streaming
        // `structuredOutput()` wrapped by `fallbackStructuredOutputStream` —
        // exactly the path #758 fixes. A 4.5+ model would use the native
        // combined path and never touch the fallback.
        const adapter = createAnthropicChat('claude-opus-4-1', DUMMY_KEY, {
          baseURL: `${LLMOCK_DEFAULT_BASE}/anthropic-structured-usage`,
        })

        const options = createChatOptions({
          adapter,
          outputSchema: z.object({
            recommendation: z.string(),
            price: z.number(),
          }),
          stream: true,
        })

        let usage: Record<string, unknown> | undefined
        try {
          for await (const chunk of chat({
            ...options,
            messages: [{ role: 'user', content: 'recommend a guitar as json' }],
          })) {
            if (chunk.type === 'RUN_FINISHED') {
              usage = chunk.usage as Record<string, unknown> | undefined
            }
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

        return new Response(JSON.stringify({ ok: true, usage }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      },
    },
  },
})
