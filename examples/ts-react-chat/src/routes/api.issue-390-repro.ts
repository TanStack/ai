import { createFileRoute } from '@tanstack/react-router'
import { chat } from '@tanstack/ai'
import { geminiText } from '@tanstack/ai-gemini'
import { z } from 'zod'
import type { ChatMiddleware, ChatMiddlewarePhase } from '@tanstack/ai'

/**
 * Runs the exact reproduction from issue #390 (gist by @imsherrill):
 * https://gist.github.com/imsherrill/af39137a58fbfc12c26f8b894e207506
 *
 * The reporter's middleware tracks onStart / onIteration / onFinish / onError.
 * Before the PR, the final Gemini structured-output call ran OUTSIDE the
 * middleware pipeline — observability/tracing middleware never saw it.
 *
 * After the PR, the call is wrapped by the engine, the middleware ctx enters
 * the `structuredOutput` phase, and the terminal hook fires once at the end
 * of the whole chat() invocation (after finalization).
 *
 * We extend the gist's middleware with `onChunk` and `phaseHistory` so the
 * page can show *what* the middleware actually observes during the structured-
 * output call — that's the smoking gun that the bug is fixed.
 */

const schema = z.object({
  answer: z.string(),
})

export const Route = createFileRoute('/api/issue-390-repro')({
  server: {
    handlers: {
      POST: async () => {
        if (!process.env.GEMINI_API_KEY && !process.env.GOOGLE_API_KEY) {
          return new Response(
            JSON.stringify({
              error:
                'GEMINI_API_KEY (or GOOGLE_API_KEY) not set — needed to run the gist against real Gemini.',
            }),
            {
              status: 400,
              headers: { 'Content-Type': 'application/json' },
            },
          )
        }

        const logs: Array<string> = []
        const phasesObservedDuringChunks = new Set<ChatMiddlewarePhase>()
        let chunksByPhase: Record<string, number> = {}

        // ====================================================================
        // The gist's exact middleware, plus an onChunk recorder that exposes
        // whether the structured-output call actually flowed through it.
        // ====================================================================
        const middleware: ChatMiddleware = {
          name: 'debug-middleware',
          onStart(ctx) {
            logs.push(`onStart model=${ctx.model}`)
          },
          onIteration(ctx, info) {
            logs.push(
              `onIteration iteration=${info.iteration} phase=${ctx.phase}`,
            )
          },
          onChunk(ctx, chunk) {
            phasesObservedDuringChunks.add(ctx.phase)
            chunksByPhase[ctx.phase] = (chunksByPhase[ctx.phase] ?? 0) + 1
            // Echo only the first chunk per phase to keep the log readable.
            if (chunksByPhase[ctx.phase] === 1) {
              logs.push(
                `onChunk first-of-phase=${ctx.phase} type=${chunk.type}`,
              )
            }
          },
          onFinish(_ctx, info) {
            logs.push(`onFinish finishReason=${info.finishReason ?? 'unknown'}`)
          },
          onError(_ctx, info) {
            logs.push(`onError error=${String(info.error)}`)
          },
        }

        try {
          // ================================================================
          // Reporter's exact chat() invocation from the gist.
          // ================================================================
          const result = await chat({
            adapter: geminiText('gemini-2.5-flash'),
            messages: [
              {
                role: 'user',
                content: 'Reply with JSON matching the schema.',
              },
            ],
            systemPrompts: ['Return a single short answer.'],
            outputSchema: schema,
            stream: false,
            middleware: [middleware],
          })

          // Verdict: the PR is fixed iff middleware observed chunks while
          // ctx.phase === 'structuredOutput'. Before the PR the structured-
          // output adapter call bypassed the middleware pipeline entirely, so
          // this set would never include 'structuredOutput'.
          const fixed = phasesObservedDuringChunks.has('structuredOutput')

          return new Response(
            JSON.stringify({
              ok: true,
              fixed,
              result,
              logs,
              phasesObservedDuringChunks: Array.from(phasesObservedDuringChunks),
              chunksByPhase,
            }),
            { headers: { 'Content-Type': 'application/json' } },
          )
        } catch (error) {
          return new Response(
            JSON.stringify({
              ok: false,
              error: error instanceof Error ? error.message : String(error),
              logs,
              phasesObservedDuringChunks: Array.from(phasesObservedDuringChunks),
              chunksByPhase,
            }),
            {
              status: 500,
              headers: { 'Content-Type': 'application/json' },
            },
          )
        }
      },
    },
  },
})
