import { createFileRoute } from '@tanstack/react-router'
import { chat } from '@tanstack/ai'
import type { Tool } from '@tanstack/ai'
import type { Provider } from '@/lib/types'
import { createTextAdapter } from '@/lib/providers'

/**
 * Drives a provider with an ordinary function whose name collides with one of
 * that provider's native tools, so the spec can assert what reached the wire.
 *
 * Gemini only, deliberately. The OpenAI half of the runtime-discriminator fix
 * lives in `openai-base`'s `src/tools/tool-converter.ts`, and the only adapter
 * that runs it is `ai-openai`'s `openaiText()` (it overrides
 * `mapOptionsToRequest` to route through the full tool converter). Neither
 * OpenAI-family provider in this app reaches that code:
 *
 *   - `openai`            -> `createOpenaiChat()`, the Chat Completions adapter,
 *                            whose converter never dispatched on tool name.
 *   - `openai-compatible` -> inherits `OpenAIBaseResponsesTextAdapter`'s
 *                            `mapOptionsToRequest`, which sends every tool
 *                            through `convertToolsToResponsesFormat` as a
 *                            function tool — no native dispatch at all.
 *
 * So an OpenAI case here would pass with or without the fix. That leg is
 * covered where the code actually lives, in
 * `packages/openai-base/tests/provider-tool-dispatch.test.ts`. Adding true E2E
 * coverage would mean adding an `openai-responses` provider to this app.
 */
type CollisionProvider = Extract<Provider, 'gemini'>

const customTools = {
  gemini: createCustomTool('google_search'),
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
  return value === 'gemini' ? value : undefined
}
