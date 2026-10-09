import { createFileRoute } from '@tanstack/react-router'
import { chat } from '@tanstack/ai'
import { createBytePlusText } from '@tanstack/ai-byteplus'

const DUMMY_KEY = 'ark-e2e-test-dummy-key'
const MODEL = 'seed-2-0-pro-260328'

/** A thinking-summary turn as Ark streams it: reasoning, the blob, text. */
const deltas = [
  { reasoning_content: 'The user wants a greeting.' },
  { content: '', reasoning_content: '', encrypted_content: 'ENC-e2e-blob' },
  { content: 'Hello!' },
]

const arkStream: typeof fetch = async () =>
  new Response(
    [
      ...deltas.map((delta, index) =>
        JSON.stringify({
          id: 'chatcmpl-e2e',
          object: 'chat.completion.chunk',
          created: 0,
          model: MODEL,
          choices: [
            {
              index: 0,
              delta,
              finish_reason: index === deltas.length - 1 ? 'stop' : null,
            },
          ],
        }),
      ),
      '[DONE]',
    ]
      .map((data) => `data: ${data}\n\n`)
      .join(''),
    { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
  )

/**
 * Ark sends `encrypted_content` for a thinking-summary model. The adapter
 * must send it as a `REASONING_ENCRYPTED_VALUE` whose `entityId` is the
 * reasoning message id: an AG-UI client attaches the value to the message
 * with that id. A scripted `fetch` answers, because aimock does not stream
 * `encrypted_content`.
 */
export const Route = createFileRoute('/api/byteplus-encrypted-reasoning-wire')({
  server: {
    handlers: {
      POST: async () => {
        const reasoningIds: Array<string> = []
        const entityIds: Array<string> = []
        for await (const chunk of chat({
          adapter: createBytePlusText(MODEL, DUMMY_KEY, { fetch: arkStream }),
          messages: [{ role: 'user', content: 'Say hi' }],
        })) {
          if (chunk.type === 'REASONING_MESSAGE_START') {
            reasoningIds.push(chunk.messageId)
          }
          if (chunk.type === 'REASONING_ENCRYPTED_VALUE') {
            entityIds.push(chunk.entityId)
          }
        }
        return Response.json({ reasoningIds, entityIds })
      },
    },
  },
})
