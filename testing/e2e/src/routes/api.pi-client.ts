import { createFileRoute } from '@tanstack/react-router'
import { chat, toolDefinition } from '@tanstack/ai'
import { fakeText } from '@tanstack/ai/testing'
import { fromPiMessages, toPiAgentEvents } from '@tanstack/ai-pi-stream'
import { z } from 'zod'

const getWeather = toolDefinition({
  name: 'getWeather',
  description: 'Get the weather for a city',
  inputSchema: z.object({ city: z.string() }),
}).server(({ city }) => `sunny in ${city}`)

// A TanStack `chat()` route that a pi client reads as pi agent events, one
// JSON event per line. No network: `fakeText` calls a server tool, then
// answers with the tool result.
export const Route = createFileRoute('/api/pi-client')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = await request.json()
        const fake = fakeText()
        fake.setResponses([
          { toolCalls: [{ name: 'getWeather', input: { city: 'Oslo' } }] },
          ({ request: next }) => ({
            text: `Tool said: ${String(next.messages.at(-1)?.content)}`,
          }),
        ])

        const events = toPiAgentEvents(
          chat({
            adapter: fake,
            threadId: body.threadId,
            tools: [getWeather],
            ...fromPiMessages(body.messages),
          }),
        )
        const encoder = new TextEncoder()
        const stream = new ReadableStream<Uint8Array>({
          async pull(controller) {
            const { done, value } = await events.next()
            if (done) controller.close()
            else
              controller.enqueue(encoder.encode(`${JSON.stringify(value)}\n`))
          },
        })
        return new Response(stream, {
          headers: { 'Content-Type': 'application/x-ndjson' },
        })
      },
    },
  },
})
