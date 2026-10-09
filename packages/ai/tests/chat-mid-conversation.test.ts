import { describe, expect, it } from 'vitest'
import { chat } from '../src/activities/chat/index'
import { defineChatMiddleware } from '../src/activities/chat/middleware/define'
import { DISCOVERY_TOOL_NAME } from '../src/activities/chat/tools/lazy-tool-manager'
import { promptHash } from '../src/utilities/mid-conversation'
import { collectChunks, createMockAdapter, ev, serverTool } from './test-utils'
import type { AnyTextAdapter } from '../src/activities/chat/adapter'
import type { ChatMiddlewareConfig } from '../src/activities/chat/middleware/types'
import type {
  MidConversationChannels,
  ModelMessage,
  StreamChunk,
  Tool,
} from '../src/types'
import type { AdapterYieldChunk } from '../src/utilities/adapter-yield-chunk'

const ON: MidConversationChannels = { tools: true, systemPrompts: true }

/** A model call that calls tool `name` with `args`. */
const toolBatch = (
  id: string,
  name = 'a',
  args: object = {},
): Array<AdapterYieldChunk> => [
  ev.runStarted(),
  ev.toolStart(id, name),
  ev.toolArgs(id, JSON.stringify(args)),
  ev.runFinished('tool_calls'),
]

/** A model call that answers `text`. */
const answer = (text: string): Array<AdapterYieldChunk> => [
  ev.runStarted(),
  ev.textStart(),
  ev.textContent(text),
  ev.textEnd(),
  ev.runFinished('stop'),
]

const lazyTool = (name: string): Tool => ({
  name,
  description: `Lazy tool: ${name}`,
  execute: () => ({ ok: true }),
  lazy: true,
})

/** The record of each message: `undefined` for a message without one. */
const records = (messages: ReadonlyArray<ModelMessage>) =>
  messages.map((message) => message.midConversationChange)

/**
 * One chat() run on the mock adapter, with `channels` on the adapter. `edit`
 * changes the config before the model call of `iteration`.
 */
async function run(options: {
  iterations: Array<Array<AdapterYieldChunk>>
  tools: Array<Tool>
  systemPrompts?: Array<string>
  channels?: MidConversationChannels
  edit?: (
    config: ChatMiddlewareConfig,
    iteration: number,
  ) => Partial<ChatMiddlewareConfig> | undefined
}) {
  const mock = createMockAdapter({ iterations: options.iterations })
  const adapter: AnyTextAdapter = options.channels
    ? { ...mock.adapter, midConversationChannels: options.channels }
    : mock.adapter
  let messages: Array<ModelMessage> = []
  await collectChunks(
    chat({
      adapter,
      messages: [{ role: 'user', content: 'go' }],
      tools: options.tools,
      systemPrompts: options.systemPrompts,
      middleware: [
        defineChatMiddleware({
          name: 'test/mid-conversation',
          onConfig(ctx, config) {
            if (ctx.phase !== 'beforeModel') return undefined
            return options.edit?.(config, ctx.iteration)
          },
          onFinish(ctx) {
            messages = [...ctx.messages]
          },
        }),
      ],
    }) as AsyncIterable<StreamChunk>,
  )
  return { calls: mock.calls, messages }
}

const addToolB = (config: ChatMiddlewareConfig, iteration: number) =>
  iteration === 1
    ? { tools: [...config.tools, serverTool('b', () => ({ ok: true }))] }
    : undefined

describe('chat() mid-conversation changes', () => {
  it.each<[string, MidConversationChannels | undefined]>([
    ['has no channels', undefined],
    ['has both channels off', { tools: false, systemPrompts: false }],
  ])(
    'sends and saves nothing new when the adapter %s',
    async (_label, channels) => {
      const { calls, messages } = await run({
        channels,
        iterations: [toolBatch('c1'), answer('done')],
        tools: [serverTool('a', () => ({ ok: true }))],
        systemPrompts: ['A'],
        edit: addToolB,
      })

      expect(calls).toHaveLength(2)
      for (const call of calls) {
        expect(call).not.toHaveProperty('midConversationChanges')
      }
      expect(messages).toHaveLength(4)
      for (const message of messages) {
        expect(message).not.toHaveProperty('midConversationChange')
      }
    },
  )

  it('writes a start point on the first call', async () => {
    const { calls, messages } = await run({
      channels: ON,
      iterations: [answer('hi')],
      tools: [serverTool('a', () => ({ ok: true }))],
      systemPrompts: ['Be short.'],
    })

    expect(calls[0]?.midConversationChanges).toEqual({
      start: { tools: ['a'], systemPrompts: 1 },
      changes: [],
    })
    expect(records(messages)).toEqual([
      undefined,
      { tools: ['a'], systemPrompts: [promptHash('Be short.')] },
    ])
  })

  it('sends a tool that onConfig adds after a tool batch as a change', async () => {
    const { calls, messages } = await run({
      channels: ON,
      iterations: [toolBatch('c1'), toolBatch('c2'), answer('done')],
      tools: [serverTool('a', () => ({ ok: true }))],
      edit: addToolB,
    })

    const start = { tools: ['a'], systemPrompts: 0 }
    // messages[3] is the assistant message of the second call.
    const changes = [{ before: 3, tools: ['b'] }]
    expect(calls.map((call) => call.midConversationChanges)).toEqual([
      { start, changes: [] },
      { start, changes },
      // Nothing new: no new record, and the old change keeps its place.
      { start, changes },
    ])
    // `tools` stays the full current list.
    expect(calls[2]?.tools?.map((tool) => tool.name)).toEqual(['a', 'b'])
    expect(records(messages)).toEqual([
      undefined,
      { tools: ['a'], systemPrompts: [] },
      undefined,
      { toolsAdded: ['b'] },
      undefined,
      undefined,
    ])
  })

  it('sends a system prompt added at the end as a change', async () => {
    const { calls, messages } = await run({
      channels: ON,
      iterations: [toolBatch('c1'), answer('done')],
      tools: [serverTool('a', () => ({ ok: true }))],
      systemPrompts: ['A'],
      edit: (config, iteration) =>
        iteration === 1
          ? { systemPrompts: [...config.systemPrompts, 'B'] }
          : undefined,
    })

    expect(calls[1]?.midConversationChanges).toEqual({
      start: { tools: ['a'], systemPrompts: 1 },
      changes: [{ before: 3, systemPrompts: 1 }],
    })
    expect(calls[1]?.systemPrompts).toEqual(['A', 'B'])
    expect(records(messages)[3]).toEqual({ systemPrompts: [promptHash('B')] })
  })

  it('makes a new start point when a tool is removed', async () => {
    const { calls, messages } = await run({
      channels: ON,
      iterations: [toolBatch('c1'), answer('done')],
      tools: [
        serverTool('a', () => ({ ok: true })),
        serverTool('b', () => ({ ok: true })),
      ],
      edit: (config, iteration) =>
        iteration === 1
          ? { tools: config.tools.filter((tool) => tool.name !== 'b') }
          : undefined,
    })

    expect(calls[1]?.midConversationChanges).toEqual({
      start: { tools: ['a'], systemPrompts: 0 },
      changes: [],
    })
    expect(records(messages)[3]).toEqual({ tools: ['a'], systemPrompts: [] })
  })

  it('makes a new start point when a prompt is edited', async () => {
    const { calls, messages } = await run({
      channels: ON,
      iterations: [toolBatch('c1'), answer('done')],
      tools: [serverTool('a', () => ({ ok: true }))],
      systemPrompts: ['A'],
      edit: (_config, iteration) =>
        iteration === 1 ? { systemPrompts: ['A2'] } : undefined,
    })

    expect(calls[1]?.midConversationChanges).toEqual({
      start: { tools: ['a'], systemPrompts: 1 },
      changes: [],
    })
    expect(records(messages)[3]).toEqual({
      tools: ['a'],
      systemPrompts: [promptHash('A2')],
    })
  })

  it('adds found lazy tools as a change, and starts again when the discovery tool drops out', async () => {
    const { calls, messages } = await run({
      channels: ON,
      iterations: [
        toolBatch('d1', DISCOVERY_TOOL_NAME, { toolNames: ['lazyA'] }),
        toolBatch('d2', DISCOVERY_TOOL_NAME, { toolNames: ['lazyB'] }),
        answer('ok'),
      ],
      tools: [lazyTool('lazyA'), lazyTool('lazyB')],
    })

    const discovery = { tools: [DISCOVERY_TOOL_NAME], systemPrompts: 0 }
    expect(calls.map((call) => call.midConversationChanges)).toEqual([
      { start: discovery, changes: [] },
      { start: discovery, changes: [{ before: 3, tools: ['lazyA'] }] },
      // Every lazy tool is found, so the discovery tool is gone.
      { start: { tools: ['lazyA', 'lazyB'], systemPrompts: 0 }, changes: [] },
    ])
    expect(records(messages)).toEqual([
      undefined,
      { tools: [DISCOVERY_TOOL_NAME], systemPrompts: [] },
      undefined,
      { toolsAdded: ['lazyA'] },
      undefined,
      { tools: ['lazyA', 'lazyB'], systemPrompts: [] },
    ])
  })

  it('saves no record for a call that fails, and the next run sends the same change', async () => {
    const history: Array<ModelMessage> = [
      { role: 'user', content: 'q1' },
      {
        role: 'assistant',
        content: 'a1',
        midConversationChange: { tools: ['a'], systemPrompts: [] },
      },
      { role: 'user', content: 'q2' },
    ]
    const mock = createMockAdapter({
      iterations: [
        [
          ev.runStarted(),
          ev.textStart(),
          ev.textContent('par'),
          ev.runError('provider down'),
        ],
        answer('a2'),
      ],
    })
    const adapter: AnyTextAdapter = {
      ...mock.adapter,
      midConversationChannels: ON,
    }
    const tools = [
      serverTool('a', () => ({ ok: true })),
      serverTool('b', () => ({ ok: true })),
    ]
    let failed: Array<ModelMessage> = []
    let finished: Array<ModelMessage> = []
    const keep = defineChatMiddleware({
      name: 'test/keep-messages',
      onError(ctx) {
        failed = [...ctx.messages]
      },
      onFinish(ctx) {
        finished = [...ctx.messages]
      },
    })

    await collectChunks(
      chat({
        adapter,
        messages: history,
        tools,
        middleware: [keep],
      }) as AsyncIterable<StreamChunk>,
    )
    await collectChunks(
      chat({
        adapter,
        messages: history,
        tools,
        middleware: [keep],
      }) as AsyncIterable<StreamChunk>,
    )

    const changes = {
      start: { tools: ['a'], systemPrompts: 0 },
      changes: [{ before: 3, tools: ['b'] }],
    }
    expect(mock.calls.map((call) => call.midConversationChanges)).toEqual([
      changes,
      changes,
    ])
    // The failed call left no assistant message, so it saved no record.
    expect(records(failed)).toEqual([
      undefined,
      { tools: ['a'], systemPrompts: [] },
      undefined,
    ])
    expect(records(finished)).toEqual([
      undefined,
      { tools: ['a'], systemPrompts: [] },
      undefined,
      { toolsAdded: ['b'] },
    ])
  })
})
