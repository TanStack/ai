import { describe, expect, it } from 'vitest'
import { toolDefinition } from '@tanstack/ai'
import { promptHash } from '@tanstack/ai/adapter-internals'
import { memoryLogStore, memoryPersistence } from '@tanstack/ai-persistence'
import { createHarnessHost, defineHarness } from '../src'
import { gate, messageTexts, mockAdapter, text, toolCall } from './helpers'
import type {
  AnyChatMiddleware,
  AnyTextAdapter,
  AnyTool,
  ModelMessage,
  Tool,
} from '@tanstack/ai'
import type { Reply } from './helpers'

const THREAD = 't1'

/** The scripted adapter of `./helpers`, on a model with both channels. */
function channelAdapter(replies: Array<Reply>) {
  const { adapter, calls } = mockAdapter(replies)
  const withChannels: AnyTextAdapter = {
    ...adapter,
    midConversationChannels: { tools: true, systemPrompts: true },
  }
  return { adapter: withChannels, calls }
}

/** The stores of a durable host: a log, runs, and metadata. */
function durablePersistence() {
  const { runs, metadata } = memoryPersistence().stores
  return { stores: { log: memoryLogStore(), runs, metadata } }
}

const lookup = toolDefinition({
  name: 'lookup',
  description: 'Look something up',
}).server(async () => 'found')

/** A tool that a later deploy, or a connector, adds. */
const extra: Tool = {
  name: 'extra',
  description: 'A tool added later',
  execute: async () => 'extra',
}

/** The record of each message that has one. */
const records = (messages: ReadonlyArray<ModelMessage>) =>
  messages.flatMap((message) =>
    message.midConversationChange ? [message.midConversationChange] : [],
  )

describe('mid-conversation changes in a harness', () => {
  it('keeps the start tools across turns and a rebuild', async () => {
    const persistence = durablePersistence()
    const { adapter, calls } = channelAdapter([
      () => text('first answer'),
      () => text('second answer'),
      () => text('third answer'),
    ])
    const harness = (tools: ReadonlyArray<AnyTool>) =>
      defineHarness({
        name: 'test/mid-conversation',
        adapter,
        systemPrompts: ['Be brief.'],
        tools,
      })
    /** One turn on a new host. The host rebuilds the transcript from the log. */
    const turnOnNewHost = async (
      tools: ReadonlyArray<AnyTool>,
      message: string,
    ) => {
      const host = createHarnessHost({ persistence })
      const session = await host.open(harness(tools), { threadId: THREAD })
      await session.prompt(message)
      const transcript = await session.transcript()
      await host.close()
      return transcript
    }

    await turnOnNewHost([lookup], 'one')
    // A deploy adds a tool between the turns.
    await turnOnNewHost([lookup, extra], 'two')
    const transcript = await turnOnNewHost([lookup, extra], 'three')

    const start = { tools: ['lookup'], systemPrompts: 1 }
    expect(calls[0].midConversationChanges).toEqual({ start, changes: [] })
    // The change goes before the answer of turn two.
    const change = { before: calls[1].messages.length, tools: ['extra'] }
    expect(calls[1].midConversationChanges).toEqual({
      start,
      changes: [change],
    })
    expect(calls[2].midConversationChanges).toEqual({
      start,
      changes: [change],
    })
    expect(calls[2].messages[change.before]).toMatchObject({
      role: 'assistant',
      content: 'second answer',
    })
    // `tools` stays the full current list. The adapter splits it.
    expect(calls[2].tools.map((tool: { name: string }) => tool.name)).toEqual([
      'lookup',
      'extra',
    ])
    expect(records(transcript)).toEqual([
      { tools: ['lookup'], systemPrompts: [promptHash('Be brief.')] },
      { toolsAdded: ['extra'] },
    ])
  })

  it('a steer and a tool change in one turn', async () => {
    const started = gate()
    const release = gate()
    let installed = false
    const { adapter, calls } = channelAdapter([
      () => toolCall('lookup', { q: 'x' }),
      () => text('done'),
      () => text('next turn'),
    ])
    // The tool call turns on `extra`, like a connector that a tool connects.
    const installs = toolDefinition({
      name: 'lookup',
      description: 'Look something up',
    }).server(async () => {
      installed = true
      started.open()
      await release.opened
      return 'found'
    })
    const addsExtra: AnyChatMiddleware = {
      name: 'test/adds-extra',
      onConfig: (ctx, config) =>
        ctx.phase === 'beforeModel' &&
        installed &&
        !config.tools.some((tool) => tool.name === 'extra')
          ? { tools: [...config.tools, extra] }
          : undefined,
    }
    const host = createHarnessHost({ persistence: memoryPersistence() })
    const session = await host.open(
      defineHarness({
        name: 'test/mid-conversation',
        adapter,
        tools: [installs],
        middleware: [addsExtra],
      }),
      { threadId: THREAD },
    )

    const turn = session.prompt('find x')
    await started.opened
    await session.steer('also check y')
    release.open()
    expect(await turn).toEqual({ text: 'done' })
    expect(await session.prompt('and now?')).toEqual({ text: 'next turn' })

    const start = { tools: ['lookup'], systemPrompts: 0 }
    expect(calls[0].midConversationChanges).toEqual({ start, changes: [] })
    // The steer joined before the second model call, so the change goes
    // after it: at the next assistant message.
    expect(messageTexts(calls[1]).at(-1)).toBe('also check y')
    const change = { before: calls[1].messages.length, tools: ['extra'] }
    expect(calls[1].midConversationChanges).toEqual({
      start,
      changes: [change],
    })
    // The next turn keeps the start set and the change at its place.
    expect(calls[2].midConversationChanges).toEqual({
      start,
      changes: [change],
    })
    expect(calls[2].messages[change.before - 1]).toMatchObject({
      role: 'user',
      content: 'also check y',
    })
    expect(calls[2].messages[change.before]).toMatchObject({
      role: 'assistant',
      content: 'done',
    })
    await host.close()
  })
})
