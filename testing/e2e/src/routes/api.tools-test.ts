import { createFileRoute } from '@tanstack/react-router'
import {
  chat,
  maxIterations,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { createLLMSimulator } from '@tanstack/tests-adapters'
import { SCENARIOS } from '@/lib/tools-test-scenarios'
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
          // scenario is in body.data (from useChat body option) or body directly (legacy)
          const messages = body.messages
          const scenario = body.data?.scenario || body.scenario || 'text-only'

          // Get the script for this scenario
          const script = SCENARIOS[scenario]
          if (!script) {
            return new Response(
              JSON.stringify({
                error: `Unknown scenario: ${scenario}. Available: ${Object.keys(SCENARIOS).join(', ')}`,
              }),
              {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
              },
            )
          }

          // Create simulator with the script
          const adapter = createLLMSimulator(script)

          // Determine which tools to include based on the scenario
          const tools = getToolsForScenario(scenario)

          const stream = chat({
            adapter,
            model: 'simulator-model',
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
