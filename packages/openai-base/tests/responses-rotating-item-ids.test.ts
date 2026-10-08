import { describe, expect, it } from 'vitest'
import OpenAI from 'openai'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import { OpenAIBaseResponsesTextAdapter } from '../src/adapters/responses-text'
import type { AdapterYieldChunk } from '@tanstack/ai'

const logger = resolveDebugOption(false)
const model = 'gpt-5.5'

class Responses extends OpenAIBaseResponsesTextAdapter<string> {}

const call = {
  type: 'function_call',
  call_id: 'call_1',
  name: 'get_weather',
  arguments: '{"city":"Paris"}',
  status: 'completed',
}

/**
 * A stateless GitHub Copilot stream gives a new item id on each event of
 * the same output item. Only `output_index` stays the same.
 */
const events = [
  {
    type: 'response.output_item.added',
    output_index: 0,
    item: { ...call, id: 'fc_a', arguments: '', status: 'in_progress' },
  },
  {
    type: 'response.function_call_arguments.delta',
    output_index: 0,
    item_id: 'fc_b',
    delta: '{"city":',
  },
  {
    type: 'response.function_call_arguments.delta',
    output_index: 0,
    item_id: 'fc_c',
    delta: '"Paris"}',
  },
  {
    type: 'response.function_call_arguments.done',
    output_index: 0,
    item_id: 'fc_d',
    arguments: '{"city":"Paris"}',
  },
  {
    type: 'response.output_item.done',
    output_index: 0,
    item: { ...call, id: 'fc_e' },
  },
  {
    type: 'response.completed',
    response: {
      id: 'response-1',
      model,
      status: 'completed',
      output: [{ ...call, id: 'fc_f' }],
    },
  },
]

async function run() {
  const client = new OpenAI({
    apiKey: 'test-key',
    fetch: async () =>
      new Response(
        events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(''),
        { headers: { 'content-type': 'text/event-stream' } },
      ),
  })
  const chunks: Array<AdapterYieldChunk> = []
  for await (const chunk of new Responses(model, 'openai', client).chatStream({
    logger,
    model,
    messages: [{ role: 'user', content: 'Weather in Paris?' }],
  })) {
    chunks.push(chunk)
  }
  return chunks
}

describe('Responses adapter with item ids that change on each event', () => {
  it('streams one tool call with all of its arguments', async () => {
    const chunks = await run()
    const starts = chunks.filter((chunk) => chunk.type === 'TOOL_CALL_START')
    const args = chunks.flatMap((chunk) =>
      chunk.type === 'TOOL_CALL_ARGS' ? [chunk.delta] : [],
    )
    const ends = chunks.flatMap((chunk) =>
      chunk.type === 'TOOL_CALL_END' ? [chunk] : [],
    )
    expect(starts).toHaveLength(1)
    expect(args).toStrictEqual(['{"city":', '"Paris"}'])
    expect(ends).toHaveLength(1)
    expect(ends[0]?.toolCallId).toBe('call_1')
    expect(ends[0]?.input).toStrictEqual({ city: 'Paris' })
  })
})
