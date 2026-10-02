import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import { OpenAIBaseResponsesTextAdapter } from '../src/adapters/responses-text'
import { webSearchTool } from '../src/tools/web-search-tool'
import type OpenAI from 'openai'
import type {
  MidConversationChanges,
  MidConversationChannels,
  ModelMessage,
  TextOptions,
  Tool,
} from '@tanstack/ai'

const logger = resolveDebugOption(false)

const create = vi.fn<(...args: Array<any>) => any>()

/** A Responses adapter with the channels that a test picks. */
class ChannelAdapter extends OpenAIBaseResponsesTextAdapter<string> {
  override readonly midConversationChannels:
    | MidConversationChannels
    | undefined = undefined

  constructor(channels: MidConversationChannels | undefined) {
    super('test-model', 'openai-base-responses', {
      responses: { create },
    } as unknown as OpenAI)
    this.midConversationChannels = channels
  }
}

/** A Responses stream that completes at once. */
function completedStream() {
  return (async function* () {
    yield {
      type: 'response.created',
      response: { id: 'resp-1', model: 'test-model', status: 'in_progress' },
    }
    yield {
      type: 'response.completed',
      response: {
        id: 'resp-1',
        model: 'test-model',
        status: 'completed',
        output: [],
        usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
      },
    }
  })()
}

/** Run one call and give back the request body that the client got. */
async function send(
  adapter: ChannelAdapter,
  options: Pick<
    TextOptions,
    'messages' | 'tools' | 'systemPrompts' | 'midConversationChanges'
  >,
) {
  create.mockClear()
  for await (const chunk of adapter.chatStream({
    logger,
    model: 'test-model',
    ...options,
  })) {
    if (chunk.type === 'RUN_ERROR') throw new Error(chunk.message)
  }
  return create.mock.calls[0]![0]
}

const both: MidConversationChannels = { tools: true, systemPrompts: true }
const lookup: Tool = { name: 'lookup', description: 'Look a thing up' }
const fetchPage: Tool = { name: 'fetch_page', description: 'Fetch a page' }
const names = (tools: Array<{ name: string }>) => tools.map((tool) => tool.name)

/** A user turn, an answer that called `lookup`, and the tool result. */
const toolTurn: Array<ModelMessage> = [
  { role: 'user', content: 'Find the page' },
  {
    role: 'assistant',
    content: null,
    toolCalls: [
      {
        id: 'call-1',
        type: 'function',
        function: { name: 'lookup', arguments: '{}' },
      },
    ],
  },
  { role: 'tool', toolCallId: 'call-1', content: 'https://example.com' },
]

/** After the tool result, `fetch_page` and a second prompt came. */
const endChange: MidConversationChanges = {
  start: { tools: ['lookup'], systemPrompts: 1 },
  changes: [{ before: 3, tools: ['fetch_page'], systemPrompts: 1 }],
}

describe('Responses mid-conversation changes', () => {
  beforeEach(() => {
    create.mockReset()
    create.mockImplementation(() => Promise.resolve(completedStream()))
  })

  it('sends added tools as additional_tools and keeps the start set in tools', async () => {
    const body = await send(new ChannelAdapter(both), {
      messages: toolTurn,
      tools: [lookup, fetchPage],
      systemPrompts: ['Be brief.', 'Cite sources.'],
      midConversationChanges: endChange,
    })

    expect(names(body.tools)).toEqual(['lookup'])
    expect(body.instructions).toBe('Be brief.')
    expect(body.input).toHaveLength(5)
    expect(body.input.slice(3)).toEqual([
      {
        type: 'additional_tools',
        role: 'developer',
        tools: [
          expect.objectContaining({ type: 'function', name: 'fetch_page' }),
        ],
      },
      { role: 'developer', content: 'Cite sources.' },
    ])
  })

  it('sends added prompts as one developer message at their place', async () => {
    const body = await send(new ChannelAdapter(both), {
      messages: [
        ...toolTurn,
        { role: 'assistant', content: 'Here it is.' },
        { role: 'user', content: 'Thanks' },
      ],
      tools: [lookup],
      systemPrompts: ['Be brief.', 'Cite sources.', 'Use short words.'],
      midConversationChanges: {
        start: { tools: ['lookup'], systemPrompts: 1 },
        changes: [{ before: 3, systemPrompts: 2 }],
      },
    })

    expect(body.instructions).toBe('Be brief.')
    expect(body.input).toHaveLength(6)
    expect(body.input[3]).toEqual({
      role: 'developer',
      content: 'Cite sources.\nUse short words.',
    })
    expect(body.input[4]).toMatchObject({
      type: 'message',
      role: 'assistant',
      content: 'Here it is.',
    })
  })

  it('falls back to the full tools list when a provider tool takes part', async () => {
    const body = await send(new ChannelAdapter(both), {
      messages: toolTurn,
      tools: [lookup, webSearchTool({ type: 'web_search' }), fetchPage],
      systemPrompts: ['Be brief.', 'Cite sources.'],
      midConversationChanges: {
        start: { tools: ['lookup', 'web_search'], systemPrompts: 1 },
        changes: [{ before: 3, tools: ['fetch_page'], systemPrompts: 1 }],
      },
    })

    expect(names(body.tools)).toEqual(['lookup', 'web_search', 'fetch_page'])
    // No additional_tools item. The prompt channel still works.
    expect(body.input.slice(3)).toEqual([
      { role: 'developer', content: 'Cite sources.' },
    ])
  })

  it('sends the full tools list when the tool channel is off', async () => {
    const body = await send(
      new ChannelAdapter({ tools: false, systemPrompts: true }),
      {
        messages: toolTurn,
        tools: [lookup, fetchPage],
        systemPrompts: ['Be brief.', 'Cite sources.'],
        midConversationChanges: endChange,
      },
    )

    expect(names(body.tools)).toEqual(['lookup', 'fetch_page'])
    expect(body.input.slice(3)).toEqual([
      { role: 'developer', content: 'Cite sources.' },
    ])
  })

  it("sends today's request without channels or without changes", async () => {
    const options = {
      messages: toolTurn,
      tools: [lookup, fetchPage],
      systemPrompts: ['Be brief.', 'Cite sources.'],
    }
    const today = await send(new ChannelAdapter(undefined), options)
    const noChannels = await send(new ChannelAdapter(undefined), {
      ...options,
      midConversationChanges: endChange,
    })
    const noChanges = await send(new ChannelAdapter(both), options)

    expect(names(today.tools)).toEqual(['lookup', 'fetch_page'])
    expect(today.instructions).toBe('Be brief.\nCite sources.')
    expect(JSON.stringify(noChannels)).toBe(JSON.stringify(today))
    expect(JSON.stringify(noChanges)).toBe(JSON.stringify(today))
  })

  it("sends today's request when a change names a tool that is not there", async () => {
    const options = {
      messages: toolTurn,
      tools: [lookup],
      systemPrompts: ['Be brief.'],
    }
    const today = await send(new ChannelAdapter(both), options)
    const body = await send(new ChannelAdapter(both), {
      ...options,
      midConversationChanges: {
        start: { tools: ['gone_tool'], systemPrompts: 1 },
        changes: [],
      },
    })

    expect(JSON.stringify(body)).toBe(JSON.stringify(today))
  })
})

describe('Responses function call namespace', () => {
  // A tool that came through `additional_tools` is called in a namespace. The
  // next request must send that namespace back, or the API answers 400.
  const namespacedCall = {
    id: 'fc_weather',
    type: 'function_call',
    call_id: 'call-weather',
    name: 'get_weather',
    namespace: 'get_weather',
  }

  /** A Responses stream in which the model calls `get_weather`. */
  function namespacedCallStream() {
    return (async function* () {
      yield {
        type: 'response.created',
        response: { id: 'resp-2', model: 'test-model', status: 'in_progress' },
      }
      yield {
        type: 'response.output_item.added',
        output_index: 0,
        item: { ...namespacedCall, status: 'in_progress', arguments: '' },
      }
      yield {
        type: 'response.output_item.done',
        output_index: 0,
        item: {
          ...namespacedCall,
          status: 'completed',
          arguments: '{"city":"Paris"}',
        },
      }
      yield {
        type: 'response.completed',
        response: {
          id: 'resp-2',
          model: 'test-model',
          status: 'completed',
          output: [],
          usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
        },
      }
    })()
  }

  beforeEach(() => {
    create.mockReset()
  })

  it('keeps the namespace of a streamed function call in the tool call metadata', async () => {
    create.mockImplementation(() => Promise.resolve(namespacedCallStream()))
    const starts: Array<unknown> = []
    for await (const chunk of new ChannelAdapter(both).chatStream({
      logger,
      model: 'test-model',
      messages: [{ role: 'user', content: 'Weather in Paris?' }],
    })) {
      if (chunk.type === 'TOOL_CALL_START') starts.push(chunk.metadata)
    }

    expect(starts).toEqual([{ itemId: 'fc_weather', namespace: 'get_weather' }])
  })

  it('sends the namespace back with the replayed function call', async () => {
    create.mockImplementation(() => Promise.resolve(completedStream()))
    const body = await send(new ChannelAdapter(both), {
      messages: [
        { role: 'user', content: 'Weather in Paris?' },
        {
          role: 'assistant',
          content: null,
          toolCalls: [
            {
              id: 'call-weather',
              type: 'function',
              function: { name: 'get_weather', arguments: '{"city":"Paris"}' },
              metadata: { itemId: 'fc_weather', namespace: 'get_weather' },
            },
          ],
        },
        { role: 'tool', toolCallId: 'call-weather', content: 'Sunny' },
      ],
    })

    expect(
      body.input.find(
        (item: { type?: string }) => item.type === 'function_call',
      ),
    ).toEqual({
      type: 'function_call',
      call_id: 'call-weather',
      id: 'fc_weather',
      name: 'get_weather',
      arguments: '{"city":"Paris"}',
      namespace: 'get_weather',
    })
  })
})
