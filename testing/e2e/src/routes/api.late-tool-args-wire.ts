import { createFileRoute } from '@tanstack/react-router'
import {
  EventType,
  chat,
  chatParamsFromRequest,
  toServerSentEventsResponse,
  toolDefinition,
} from '@tanstack/ai'
import { FakeTextAdapter } from '@tanstack/ai/testing'
import { z } from 'zod'
import type { AdapterYieldChunk, TextOptions } from '@tanstack/ai'

class LateToolArgsAdapter extends FakeTextAdapter<'fake-model'> {
  override async *chatStream(
    options: TextOptions,
  ): AsyncIterable<AdapterYieldChunk> {
    for await (const chunk of super.chatStream(options)) {
      yield chunk
      if (chunk.type === EventType.TOOL_CALL_END) {
        yield {
          type: EventType.TOOL_CALL_ARGS,
          toolCallId: chunk.toolCallId,
          delta: '}',
        }
      }
    }
  }
}

const getWeather = toolDefinition({
  name: 'getWeather',
  description: 'Get the weather for a city',
  inputSchema: z.object({ city: z.string() }),
}).server(({ city }) => ({ forecast: `Sunny in ${city}` }))

async function streamLateToolArgs(request: Request): Promise<Response> {
  const params = await chatParamsFromRequest(request)
  const adapter = new LateToolArgsAdapter('fake-model', {})
  adapter.setResponses([
    { toolCalls: [{ name: getWeather.name, input: { city: 'Paris' } }] },
    { text: 'Done.' },
  ])
  return toServerSentEventsResponse(
    chat({ ...params, adapter, tools: [getWeather] }),
  )
}

export const Route = createFileRoute('/api/late-tool-args-wire')({
  server: {
    handlers: {
      POST: ({ request }) => streamLateToolArgs(request),
    },
  },
})
