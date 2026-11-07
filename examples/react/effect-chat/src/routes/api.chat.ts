import { createFileRoute } from '@tanstack/react-router'
import { chatParamsFromRequest, toServerSentEventsResponse } from '@tanstack/ai'
import * as AI from '@tanstack/ai-effect'
import { openaiText } from '@tanstack/ai-openai'
import { Stream } from 'effect'
import { WeatherLive, getWeather } from '@/lib/weather'

export async function POST({ request }: { request: Request }) {
  const params = await chatParamsFromRequest(request)

  const stream = AI.chat({
    adapter: openaiText('gpt-6.1-sol'),
    messages: params.messages,
    threadId: params.threadId,
    runId: params.runId,
    tools: [getWeather],
  }).pipe(Stream.provide(WeatherLive))

  return toServerSentEventsResponse(Stream.toAsyncIterable(stream))
}

export const Route = createFileRoute('/api/chat')({
  server: {
    handlers: {
      POST,
    },
  },
})
