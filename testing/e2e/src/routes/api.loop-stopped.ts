import { createFileRoute } from '@tanstack/react-router'
import {
  chat,
  maxIterations,
  toServerSentEventsResponse,
  toolDefinition,
} from '@tanstack/ai'
import { fakeText } from '@tanstack/ai/testing'
import { z } from 'zod'

/**
 * No network: `fakeText` answers from a script, and `maxIterations(2)` allows
 * two model calls. The route sends the stream as SSE.
 *
 * - Default: both answers call a tool, so the loop stops the run.
 * - `?done`: the second answer is text, so the model ends the run.
 */
export const Route = createFileRoute('/api/loop-stopped')({
  server: {
    handlers: {
      POST: ({ request }) => {
        const done = new URL(request.url).searchParams.has('done')
        const fake = fakeText()
        fake.setResponses([
          { toolCalls: [{ name: 'getWeather', input: { city: 'Oslo' } }] },
          done
            ? { text: 'Sunny in Oslo.' }
            : { toolCalls: [{ name: 'getWeather', input: { city: 'Bergen' } }] },
          { text: 'The loop never asks for this answer.' },
        ])

        const getWeather = toolDefinition({
          name: 'getWeather',
          description: 'Get the weather for a city',
          inputSchema: z.object({ city: z.string() }),
        }).server(({ city }) => `sunny in ${city}`)

        return toServerSentEventsResponse(
          chat({
            threadId: 'loop-stopped',
            adapter: fake,
            messages: [{ role: 'user', content: 'Weather in Oslo?' }],
            tools: [getWeather],
            agentLoopStrategy: maxIterations(2),
          }),
        )
      },
    },
  },
})
