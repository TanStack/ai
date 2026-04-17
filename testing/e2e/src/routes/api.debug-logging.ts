import { createFileRoute } from '@tanstack/react-router'
import { chat, maxIterations } from '@tanstack/ai'
import type { DebugOption, Logger } from '@tanstack/ai'
import { createTextAdapter } from '@/lib/providers'

/**
 * Test-only endpoint for the debug logging E2E spec.
 *
 * Runs `chat()` against the aimock harness with the supplied `debug` option,
 * captures every log line the library emits via an in-memory `Logger`, drains
 * the resulting stream, and returns the captured log messages as JSON.
 *
 * The spec asserts on the `[tanstack-ai:<category>]` prefixes present in the
 * response — verifying the logger wiring works end-to-end across chat +
 * adapter + middleware pipeline.
 */
export const Route = createFileRoute('/api/debug-logging')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        await import('@/lib/llmock-server').then((m) => m.ensureLLMock())

        const body = await request.json()
        const testId: string | undefined =
          typeof body?.testId === 'string' ? body.testId : undefined
        const aimockPort: number | undefined =
          body?.aimockPort != null ? Number(body.aimockPort) : undefined
        const debug: DebugOption = body?.debug as DebugOption
        const userMessage: string = body?.userMessage ?? '[debug-logging] hello'

        const captured: Array<{ level: string; message: string }> = []
        const capturingLogger: Logger = {
          debug: (message) => captured.push({ level: 'debug', message }),
          info: (message) => captured.push({ level: 'info', message }),
          warn: (message) => captured.push({ level: 'warn', message }),
          error: (message) => captured.push({ level: 'error', message }),
        }

        // Merge the caller's debug option with our capturing logger so the
        // test observes exactly what the library emitted.
        let resolvedDebug: DebugOption
        if (debug === true) {
          resolvedDebug = { logger: capturingLogger }
        } else if (debug === false) {
          resolvedDebug = false
        } else if (debug && typeof debug === 'object') {
          resolvedDebug = { ...debug, logger: capturingLogger }
        } else {
          resolvedDebug = { logger: capturingLogger }
        }

        const adapterOptions = createTextAdapter(
          'openai',
          undefined,
          aimockPort,
          testId,
        )

        try {
          const stream = chat({
            ...adapterOptions,
            messages: [{ role: 'user', content: userMessage }],
            agentLoopStrategy: maxIterations(1),
            debug: resolvedDebug,
          })

          // Drain the stream — the debug logger is invoked as chunks flow.
          for await (const _chunk of stream) {
            void _chunk
          }

          return new Response(JSON.stringify({ logs: captured }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        } catch (error: any) {
          return new Response(
            JSON.stringify({
              error: error?.message ?? 'An error occurred',
              logs: captured,
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
