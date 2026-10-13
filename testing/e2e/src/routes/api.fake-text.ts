import { createFileRoute } from '@tanstack/react-router'
import { chat, toolDefinition } from '@tanstack/ai'
import { fakeText } from '@tanstack/ai/testing'
import { z } from 'zod'

// No network: `fakeText` answers from a script. The first answer calls a
// tool, the second answer is the final text.
export const Route = createFileRoute('/api/fake-text')({
  server: {
    handlers: {
      POST: async () => {
        const fake = fakeText()
        fake.setResponses([
          { toolCalls: [{ name: 'getWeather', input: { city: 'Oslo' } }] },
          ({ request }) => ({
            text: `Tool said: ${String(request.messages.at(-1)?.content)}`,
          }),
        ])

        const getWeather = toolDefinition({
          name: 'getWeather',
          description: 'Get the weather for a city',
          inputSchema: z.object({ city: z.string() }),
        }).server(({ city }) => `sunny in ${city}`)

        const { text } = await chat({
          adapter: fake,
          messages: [{ role: 'user', content: 'Weather in Oslo?' }],
          tools: [getWeather],
          stream: false,
        })

        return Response.json({
          text,
          callCount: fake.state.callCount,
          pending: fake.pendingResponses(),
        })
      },
    },
  },
})
