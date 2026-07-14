import { createFileRoute } from '@tanstack/react-router'
import { chat, generateImage, maxIterations } from '@tanstack/ai'
import { defineAssistant } from '@tanstack/ai/assistant'
import type { Provider } from '@/lib/types'
import { createTextAdapter } from '@/lib/providers'
import { createImageAdapter } from '@/lib/media-providers'

export const Route = createFileRoute('/api/assistant')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        await import('@/lib/llmock-server').then((m) => m.ensureLLMock())

        // `assistant.handler(request)` below consumes the body itself via
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

        const assistant = defineAssistant({
          chat: (req) =>
            chat({
              ...createTextAdapter(
                provider,
                undefined,
                aimockPort,
                testId,
                'assistant',
              ),
              messages: req.messages,
              agentLoopStrategy: maxIterations(5),
              threadId: req.threadId,
              runId: req.runId,
            }),
          image: (req) =>
            generateImage({
              adapter: createImageAdapter(provider, aimockPort, testId),
              prompt: req.prompt as string,
            }),
        })

        return assistant.handler(request)
      },
    },
  },
})
