import { createFileRoute } from '@tanstack/react-router'
import { boolean, decide } from '@tanstack/ai'
import { createCloudflareDecider } from '@tanstack/ai-cloudflare'

const STATE = { order_id: 'ORD-0001', status: 'shipped' }
const QUESTIONS = {
  shipped: boolean({ instructions: 'Has the order shipped?' }),
}

/** Jev output as Workers AI returns it: wrapped in `{ state, result }`. */
const run = {
  state: 'Completed',
  result: {
    model: 'jev-1.13.0',
    answers: { shipped: { type: 'noul', noul: 0.99 } },
    usage: { input_tokens: 397, output_tokens: 49 },
  },
}

/**
 * `decide()` with the Cloudflare decider over a fake `env.AI` and over REST
 * with a fake fetch. Returns both results and what the REST request sent.
 */
export const Route = createFileRoute('/api/cloudflare-evaluate-wire')({
  server: {
    handlers: {
      POST: async () => {
        try {
          // The real binding exists only inside a Worker. The stand-in has the
          // one method the adapter calls.
          const binding = { run: async () => run } as unknown as NonNullable<
            Parameters<typeof createCloudflareDecider>[1]['binding']
          >
          const viaBinding = await decide({
            adapter: createCloudflareDecider('typesafe/jev', { binding }),
            state: STATE,
            questions: QUESTIONS,
          })

          let restUrl = ''
          let restBody: unknown
          const viaRest = await decide({
            adapter: createCloudflareDecider('typesafe/jev', {
              accountId: 'acc',
              apiKey: 'tok',
              fetch: async (url, init) => {
                restUrl = String(url)
                restBody = JSON.parse(String(init?.body))
                return Response.json({ success: true, result: run })
              },
            }),
            state: STATE,
            questions: QUESTIONS,
          })

          return Response.json({
            ok: true,
            viaBinding,
            viaRest,
            restUrl,
            restBody,
          })
        } catch (error) {
          return Response.json({
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          })
        }
      },
    },
  },
})
