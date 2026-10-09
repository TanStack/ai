import { createFileRoute } from '@tanstack/react-router'
import { chat } from '@tanstack/ai'
import { createGeminiChat } from '@tanstack/ai-gemini'
import { createAnthropicChat } from '@tanstack/ai-anthropic'
import { createOpenaiChat } from '@tanstack/ai-openai'
import type {
  AnyTextAdapter,
  FetchWrapper,
  ReasoningRequest,
} from '@tanstack/ai'

const LLMOCK_DEFAULT_BASE = process.env.LLMOCK_URL || 'http://127.0.0.1:4010'
const DUMMY_KEY = 'sk-e2e-test-dummy-key'

const reasoning: ReasoningRequest = { level: 'medium', summary: true }
// Gemini 2.5 Flash takes only `off` and `high`, so ask for `high` with an
// explicit budget. The mount checks the budget on the wire.
const geminiReasoning: ReasoningRequest = {
  level: 'high',
  summary: true,
  budgetTokens: 8192,
}
const messages = [
  {
    role: 'user' as const,
    content: '[reasoning] recommend a guitar for a beginner',
  },
]

/**
 * Wire check for `chat({ reasoning })`. OpenAI and Anthropic record the raw
 * request body with `wrapFetch`, because aimock's journal normalizes bodies.
 * Gemini posts to the `/reasoning-wire-gemini` mount, which answers only when
 * `generationConfig.thinkingConfig` is right.
 */
export const Route = createFileRoute('/api/reasoning-wire')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = new URL(request.url)
        const testId = url.searchParams.get('testId') ?? undefined
        const provider = url.searchParams.get('provider')

        const bodies: Array<Record<string, unknown>> = []
        const capture: FetchWrapper = (next) => async (input, init) => {
          const body = new Request(input, init).clone()
          bodies.push(JSON.parse(await body.text()) as Record<string, unknown>)
          return next(input, init)
        }

        const headers = testId ? { 'X-Test-Id': testId } : undefined
        const adapter: AnyTextAdapter =
          provider === 'gemini'
            ? createGeminiChat('gemini-2.5-flash', DUMMY_KEY, {
                baseURL: `${LLMOCK_DEFAULT_BASE}/reasoning-wire-gemini`,
              })
            : provider === 'anthropic'
              ? createAnthropicChat('claude-sonnet-4-5', DUMMY_KEY, {
                  baseURL: LLMOCK_DEFAULT_BASE,
                  defaultHeaders: headers,
                })
              : createOpenaiChat('o3', DUMMY_KEY, {
                  baseURL: `${LLMOCK_DEFAULT_BASE}/v1`,
                  defaultHeaders: headers,
                })

        let text = ''
        try {
          for await (const chunk of chat({
            adapter,
            messages,
            reasoning: provider === 'gemini' ? geminiReasoning : reasoning,
            wrapFetch: capture,
          })) {
            if (chunk.type === 'TEXT_MESSAGE_CONTENT') text += chunk.delta
          }
        } catch (error) {
          return Response.json({
            ok: false,
            error: error instanceof Error ? error.message : String(error),
            bodies,
          })
        }

        return Response.json({ ok: true, text, bodies })
      },
    },
  },
})
