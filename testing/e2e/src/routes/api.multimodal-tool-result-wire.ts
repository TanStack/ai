import { createFileRoute } from '@tanstack/react-router'
import { chat, createChatOptions } from '@tanstack/ai'
import { createTextAdapter } from '@/lib/providers'
import type { ModelMessage } from '@tanstack/ai'
import type { Provider } from '@/lib/types'

// 1x1 transparent PNG (base64) — enough to assert structured passthrough.
const PNG_1x1 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/1eYAAAAAElFTkSuQmCC'

/**
 * Wire-format verification for multimodal tool-result messages (#363).
 *
 * A tool message's `content` can now be `Array<ContentPart>`, and the
 * OpenAI / Anthropic / Gemini adapters convert it to structured provider tool
 * output instead of `JSON.stringify`. This route drives a single `chat()` call
 * whose `messages` already contain a multimodal tool result so the companion
 * spec can inspect aimock's journal (`GET /v1/_requests`) and assert the
 * adapter emitted STRUCTURED tool output (image block present) per provider.
 */
export const Route = createFileRoute('/api/multimodal-tool-result-wire')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = new URL(request.url)
        const provider = (url.searchParams.get('provider') ??
          'openai') as Provider
        const testId = url.searchParams.get('testId') ?? undefined

        const { adapter } = createTextAdapter(
          provider,
          undefined,
          undefined,
          testId,
        )

        const messages: Array<ModelMessage> = [
          { role: 'user', content: 'Look at the screenshot.' },
          {
            role: 'assistant',
            content: '',
            toolCalls: [
              {
                id: 'call_1',
                type: 'function',
                function: { name: 'getShot', arguments: '{}' },
              },
            ],
          },
          {
            role: 'tool',
            toolCallId: 'call_1',
            content: [
              { type: 'text', content: 'screenshot' },
              {
                type: 'image',
                source: { type: 'data', value: PNG_1x1, mimeType: 'image/png' },
              },
            ],
          },
        ]

        try {
          for await (const _ of chat({
            ...createChatOptions({ adapter }),
            messages,
          })) {
            // Drain the stream.
          }
        } catch (error) {
          return new Response(
            JSON.stringify({
              ok: false,
              error: error instanceof Error ? error.message : String(error),
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          )
        }

        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      },
    },
  },
})
