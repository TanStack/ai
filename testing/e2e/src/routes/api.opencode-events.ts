import { createFileRoute } from '@tanstack/react-router'
import { EventType, chat } from '@tanstack/ai'
import { InMemoryLockStore, withLocks } from '@tanstack/ai/locks'
import { InMemorySandboxInstanceStore, withSandbox } from '@tanstack/ai-sandbox'
import { opencodeText } from '@tanstack/ai-opencode'
import { fakeOpencodeSandbox } from '@/lib/fake-opencode'

/**
 * The OpenCode adapter against a fake `opencode serve` with the events of
 * OpenCode 1.19.6 (see `fake-opencode.ts`). POST `{ mode: 'text' }` or
 * `{ mode: 'permission' }`. The response has the chunk types of the run, its
 * text, and the reply that the adapter sent to the permission request.
 *
 * Provider-free: fake OpenCode server and fake sandbox (exempt from aimock).
 */
export const Route = createFileRoute('/api/opencode-events')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body: unknown = await request.json()
        const mode =
          typeof body === 'object' &&
          body !== null &&
          'mode' in body &&
          body.mode === 'permission'
            ? 'permission'
            : 'text'
        const fake = fakeOpencodeSandbox(mode)
        const stream = chat({
          adapter: opencodeText('anthropic/claude-sonnet-4-5'),
          messages: [{ role: 'user', content: 'go' }],
          threadId: `opencode-${crypto.randomUUID()}`,
          runId: crypto.randomUUID(),
          middleware: [
            withLocks(new InMemoryLockStore()),
            withSandbox(fake.sandbox, {
              instances: new InMemorySandboxInstanceStore(),
            }),
          ],
        })
        const chunks: Array<string> = []
        let text = ''
        for await (const chunk of stream) {
          if (chunk.type === EventType.TEXT_MESSAGE_CONTENT) {
            text += chunk.delta
            chunks.push(`TEXT(${chunk.delta})`)
          } else if (chunk.type === EventType.CUSTOM) {
            chunks.push(`CUSTOM(${chunk.name})`)
          } else {
            chunks.push(chunk.type)
          }
        }
        return Response.json({ chunks, text, reply: fake.reply() ?? null })
      },
    },
  },
})
