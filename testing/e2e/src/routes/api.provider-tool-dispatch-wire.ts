import { createFileRoute } from '@tanstack/react-router'
import { chat } from '@tanstack/ai'
import type { Tool } from '@tanstack/ai'
import type { Provider } from '@/lib/types'
import { createTextAdapter } from '@/lib/providers'

type CollisionProvider = Extract<Provider, 'gemini' | 'openai'>

const customTools = {
  gemini: createCustomTool('google_search'),
  openai: createCustomTool('web_search'),
} satisfies Record<CollisionProvider, Tool>

export const Route = createFileRoute('/api/provider-tool-dispatch-wire')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        await import('@/lib/llmock-server').then((module) =>
          module.ensureLLMock(),
        )
        const url = new URL(request.url)
        const provider = readProvider(url.searchParams.get('provider'))
        const testId = url.searchParams.get('testId') ?? undefined

        if (!provider) {
          return new Response('Unsupported provider', { status: 400 })
        }

        try {
          for await (const _ of chat({
            ...createTextAdapter(provider, undefined, undefined, testId),
            messages: [
              {
                role: 'user',
                content: '[provider-tool-dispatch] preserve custom tool',
              },
            ],
            tools: [customTools[provider]],
          })) {
            // Drain the stream.
          }
        } catch (error) {
          return Response.json({
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          })
        }

        return Response.json({ ok: true })
      },
    },
  },
})

function createCustomTool(name: string): Tool {
  return {
    name,
    description: 'Run an application function',
    inputSchema: {
      type: 'object',
      properties: { query: { type: 'string' } },
      required: ['query'],
    },
  }
}

function readProvider(value: string | null): CollisionProvider | undefined {
  if (value === 'gemini' || value === 'openai') {
    return value
  }
  return undefined
}
