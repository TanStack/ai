import { createFileRoute } from '@tanstack/react-router'
import { chat } from '@tanstack/ai'
import { azureOpenaiText } from '@tanstack/ai-openai'

const LLMOCK_DEFAULT_BASE = process.env.LLMOCK_URL || 'http://127.0.0.1:4010'

/**
 * Sends one Azure OpenAI Responses call to aimock. aimock maps
 * `/openai/v1/responses` to its Responses handler and keeps the original path
 * in its journal, so the spec can check the path, the `api-key` header, and
 * the deployment name on the wire.
 */
export const Route = createFileRoute('/api/azure-openai-wire')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        await import('@/lib/llmock-server').then((m) => m.ensureLLMock())
        const body: unknown = await request.json()
        const testId =
          typeof body === 'object' &&
          body !== null &&
          'testId' in body &&
          typeof body.testId === 'string'
            ? body.testId
            : undefined
        const { text } = await chat({
          adapter: azureOpenaiText('gpt-5.5', {
            apiKey: 'azure-e2e-key',
            baseURL: `${LLMOCK_DEFAULT_BASE}/openai/v1`,
            deploymentName: 'e2e-deployment',
            ...(testId ? { defaultHeaders: { 'X-Test-Id': testId } } : {}),
          }),
          messages: [
            {
              role: 'user',
              content: '[oneshot] what is your most popular guitar',
            },
          ],
          stream: false,
        })
        return Response.json({ text })
      },
    },
  },
})
