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
  id: 'fc_1',
  call_id: 'call_1',
  name: 'get_weather',
  arguments: '{"city":"Paris"}',
  status: 'completed',
}

/**
 * A ChatGPT plan stream (`store: false`) streams the tool call, then sends
 * `response.completed` with an empty `output`.
 */
const events = [
  {
    type: 'response.output_item.added',
    output_index: 0,
    item: { ...call, arguments: '', status: 'in_progress' },
  },
  {
    type: 'response.function_call_arguments.done',
    output_index: 0,
    item_id: 'fc_1',
    arguments: '{"city":"Paris"}',
  },
  { type: 'response.output_item.done', output_index: 0, item: call },
  {
    type: 'response.completed',
    response: { id: 'response-1', model, status: 'completed', output: [] },
  },
]

async function run(stream: Array<unknown>) {
  const client = new OpenAI({
    apiKey: 'test-key',
    fetch: async () =>
      new Response(
        stream.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(''),
        { headers: { 'content-type': 'text/event-stream' } },
      ),
  })
  const chunks: Array<AdapterYieldChunk> = []
  for await (const chunk of new Responses(model, 'openai', client).chatStream({
    threadId: 'thread-1',
    logger,
    model,
    messages: [{ role: 'user', content: 'Weather in Paris?' }],
  })) {
    chunks.push(chunk)
  }
  return chunks
}

describe('Responses adapter with an empty completed output', () => {
  it('finishes with tool_calls after a streamed tool call', async () => {
    const chunks = await run(events)
    const ends = chunks.flatMap((chunk) =>
      chunk.type === 'TOOL_CALL_END' ? [chunk] : [],
    )
    const finished = chunks.find((chunk) => chunk.type === 'RUN_FINISHED')
    expect(ends).toHaveLength(1)
    expect(ends[0]?.input).toStrictEqual({ city: 'Paris' })
    expect(finished?.finishReason).toBe('tool_calls')
  })

  it('finishes with tool_calls when the name comes on output_item.done', async () => {
    const chunks = await run([
      {
        type: 'response.output_item.added',
        output_index: 0,
        item: { ...call, name: '', arguments: '', status: 'in_progress' },
      },
      ...events.slice(1),
    ])
    const finished = chunks.find((chunk) => chunk.type === 'RUN_FINISHED')
    expect(
      chunks.filter((chunk) => chunk.type === 'TOOL_CALL_START'),
    ).toHaveLength(1)
    expect(finished?.finishReason).toBe('tool_calls')
  })

  it('finishes with tool_calls after a streamed apply_patch call', async () => {
    const patch = {
      type: 'apply_patch_call',
      id: 'apc_1',
      call_id: 'call_patch',
      status: 'completed',
      operation: { type: 'update_file', path: 'a.py', diff: '@@\n-a\n+b\n' },
    }
    const chunks = await run([
      { type: 'response.output_item.done', output_index: 0, item: patch },
      events[3],
    ])
    const finished = chunks.find((chunk) => chunk.type === 'RUN_FINISHED')
    expect(finished?.finishReason).toBe('tool_calls')
  })

  it('finishes with stop when the stream has no tool call', async () => {
    const chunks = await run([
      {
        type: 'response.output_text.delta',
        output_index: 0,
        content_index: 0,
        item_id: 'msg_1',
        delta: 'Hi',
      },
      events[3],
    ])
    const finished = chunks.find((chunk) => chunk.type === 'RUN_FINISHED')
    expect(finished?.finishReason).toBe('stop')
  })
})
