import { createFileRoute } from '@tanstack/react-router'
import { chat, maxIterations, toServerSentEventsResponse } from '@tanstack/ai'
import { createTextAdapter } from '@/lib/providers'
import { getToolsForScenario } from '@/lib/tools-test-tools'

export const Route = createFileRoute('/api/tools-test')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const requestSignal = request.signal

        if (requestSignal?.aborted) {
          return new Response(null, { status: 499 })
        }

        const abortController = new AbortController()

        try {
          const body = await request.json()
          const messages = body.messages
          const scenario = body.data?.scenario || body.scenario || 'text-only'
          const testId: string | undefined =
            typeof body.data?.testId === 'string' ? body.data.testId : undefined
          const aimockPort: number | undefined =
            body.data?.aimockPort != null
              ? Number(body.data.aimockPort)
              : undefined

          // Special error scenario: return a stream that immediately errors
          if (scenario === 'error') {
            const errorStream = (async function* () {
              yield {
                type: 'RUN_STARTED' as const,
                runId: 'error-test',
                timestamp: Date.now(),
              }
              yield {
                type: 'RUN_ERROR' as const,
                runId: 'error-test',
                error: {
                  message: 'Test error: Something went wrong during generation',
                },
                timestamp: Date.now(),
              }
            })()
            return toServerSentEventsResponse(errorStream, { abortController })
          }

          const adapterOptions = createTextAdapter(
            'openai',
            undefined,
            aimockPort,
            testId,
          )

          const tools = getToolsForScenario(scenario)

          const stream = chat({
            ...adapterOptions,
            messages,
            tools,
            agentLoopStrategy: maxIterations(20),
            abortController,
          })

          return toServerSentEventsResponse(stream, { abortController })
        } catch (error: any) {
          console.error('[Tools Test API] Error:', error)
          if (error.name === 'AbortError' || abortController.signal.aborted) {
            return new Response(null, { status: 499 })
          }
          return new Response(
            JSON.stringify({
              error: error.message || 'An error occurred',
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
