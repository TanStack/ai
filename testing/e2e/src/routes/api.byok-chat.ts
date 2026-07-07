import { createFileRoute } from '@tanstack/react-router'
import {
  chat,
  chatParamsFromRequestBody,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { byokMissing, getByokKey } from '@tanstack/ai-byok/server'
import { createTextAdapter } from '@/lib/providers'

/**
 * BYOK relay for E2E. Reads the OpenAI key from the per-provider request header
 * (never the body), hands it to the adapter for this one call, and streams the
 * aimock-backed response. Returns a typed `byokMissing` 401 when the header is
 * absent. Never persists or logs the key.
 */
export const Route = createFileRoute('/api/byok-chat')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        await import('@/lib/llmock-server').then((m) => m.ensureLLMock())

        let params
        try {
          params = await chatParamsFromRequestBody(await request.json())
        } catch (error) {
          return new Response(
            error instanceof Error ? error.message : 'Bad request',
            { status: 400 },
          )
        }

        const fp = params.forwardedProps as Record<string, unknown>
        const testId = typeof fp.testId === 'string' ? fp.testId : undefined

        // Header-only read. No key → typed 401 the client renders.
        const apiKey = getByokKey(request, 'openai')
        if (!apiKey) return byokMissing('openai')

        const adapterOptions = createTextAdapter(
          'openai',
          undefined,
          undefined,
          testId,
          'chat',
          apiKey,
        )

        const stream = chat({
          ...adapterOptions,
          messages: params.messages,
          threadId: params.threadId,
          runId: params.runId,
        })
        return toServerSentEventsResponse(stream)
      },
    },
  },
})
