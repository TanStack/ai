import { createFileRoute } from '@tanstack/react-router'
import { chat, maxIterations } from '@tanstack/ai'
import { chatVerb, defineTransaction, verb } from '@tanstack/ai/transaction'
import { z } from 'zod'
import type { Provider } from '@/lib/types'
import { createTextAdapter } from '@/lib/providers'

/**
 * Drain a ChatStream and accumulate the assistant text. Used by the one-shot
 * `banner` verb below to turn a (mocked, deterministic) chat completion into
 * a plain result value.
 */
async function collectText(stream: AsyncIterable<unknown>): Promise<string> {
  let text = ''
  for await (const chunk of stream) {
    if (
      chunk != null &&
      typeof chunk === 'object' &&
      'type' in chunk &&
      chunk.type === 'TEXT_MESSAGE_CONTENT' &&
      'delta' in chunk &&
      typeof chunk.delta === 'string'
    ) {
      text += chunk.delta
    }
  }
  return text
}

export const Route = createFileRoute('/api/transaction')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        await import('@/lib/llmock-server').then((m) => m.ensureLLMock())

        // `transaction.handler(request)` below consumes the body itself via
        // `request.json()`, so peek at a clone here to pull the
        // provider/testId/aimockPort needed to construct adapters, and pass
        // the original (unconsumed) request through to the handler.
        const peekBody = await request.clone().json()
        const peekData = peekBody.forwardedProps ?? peekBody.data ?? peekBody
        const { provider, testId, aimockPort } = peekData as {
          provider: Provider
          testId?: string
          aimockPort?: number
        }

        const textOptions = () =>
          createTextAdapter(
            provider,
            undefined,
            aimockPort,
            testId,
            'transaction',
          )

        // One-shot verb: schema-validated input in, result out. Runs a
        // single deterministic chat completion against aimock (the fixture
        // keys on the exact `[transaction] banner: …` user message).
        const banner = verb({
          input: z.object({ prompt: z.string() }),
          execute: async (req) => {
            const text = await collectText(
              chat({
                ...textOptions(),
                messages: [
                  {
                    role: 'user',
                    content: `[transaction] banner: ${req.input.prompt}`,
                  },
                ],
                agentLoopStrategy: maxIterations(1),
                threadId: req.threadId,
                runId: req.runId,
              }),
            )
            return { prompt: req.input.prompt, text }
          },
        })

        const transaction = defineTransaction({
          // Conversational verb: full chat surface on the client.
          primaryChat: chatVerb((req) =>
            chat({
              ...textOptions(),
              messages: req.messages,
              agentLoopStrategy: maxIterations(5),
              threadId: req.threadId,
              runId: req.runId,
            }),
          ),
          banner,
          // Composing verb: runs the sibling `banner` verb twice via
          // `ctx.call`, so the client observes two tagged sub-runs
          // (transaction:sub-run:* CUSTOM events) inside one SSE response.
          bannerPair: verb({
            input: z.object({ topic: z.string() }),
            execute: async ({ input }, ctx) => {
              // Sequential so sub-run start order (hero=0, thumb=1) is
              // deterministic for the spec's per-index assertions.
              const hero = await ctx.call(banner, {
                prompt: `hero ${input.topic}`,
              })
              const thumb = await ctx.call(banner, {
                prompt: `thumb ${input.topic}`,
              })
              return { hero, thumb }
            },
          }),
        })

        return transaction.handler(request)
      },
    },
  },
})
