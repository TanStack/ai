import { describe, expect, it } from 'vitest'
import { defineAgent } from '@tanstack/ai'
import { memoryPersistence } from '@tanstack/ai-persistence'
import { createHarnessHost, defineHarness } from '../src'
import {
  after,
  gate,
  messageTexts,
  mockAdapter,
  text,
  toolCall,
} from './helpers'
import type { AnyTextAdapter, ModelMessage } from '@tanstack/ai'
import type { HarnessPersistence } from '../src'

/**
 * Open thread `t` of a harness whose lead model can start `writer` through
 * its `writer` tool. `writer` answers with `child`.
 */
async function openLead(
  lead: AnyTextAdapter,
  child: AnyTextAdapter,
  persistence: HarnessPersistence = memoryPersistence(),
) {
  const writer = defineAgent({
    name: 'writer',
    description: 'Writes notes',
    run: (ctx) => ctx.chat({ adapter: child }),
  })
  const host = createHarnessHost({ persistence })
  const harness = defineHarness({
    name: 'test/subagent-children',
    adapter: lead,
    subagents: { agents: [writer] },
  })
  const session = await host.open(harness, { threadId: 't' })
  return { host, session, harness }
}

/** One lead model call of the `writer` tool. */
function callWriter(args: Record<string, unknown>, id: string) {
  return toolCall('writer', args, id)
}

/** The result the lead model got for tool call `id`, parsed. */
function toolResultIn(call: { messages: Array<ModelMessage> }, id: string) {
  const message = call.messages.find(
    (entry) => entry.role === 'tool' && entry.toolCallId === id,
  )
  return JSON.parse(String(message?.content))
}

/** The id of the child that tool call `id` started. */
function childIdIn(call: { messages: Array<ModelMessage> }, id: string) {
  const { subagentRunId } = toolResultIn(call, id)
  if (typeof subagentRunId !== 'string') throw new Error('no child id')
  return subagentRunId
}

/** Lead replies: start `writer` in the background, then answer the wake. */
function backgroundLead(woke: { open: () => void }) {
  return [
    () => callWriter({ prompt: 'Look around', background: true }, 'call-1'),
    () => text('Started.'),
    () => {
      woke.open()
      return text('Got it.')
    },
  ]
}

const WAKE = 'Background agent writer finished: [writer finished] Found it'

describe('subagent children of a harness session', () => {
  it('indexes a child the model starts under the session thread', async () => {
    const lead = mockAdapter([
      () => callWriter({ prompt: 'Take notes' }, 'call-1'),
      () => text('Done.'),
    ])
    const child = mockAdapter(() => text('Note 1'))
    const { host, session } = await openLead(lead.adapter, child.adapter)

    await session.send('Notes, please')

    const threadId = `subagent:${childIdIn(lead.calls[1], 'call-1')}`
    expect(await host.sessions.get({ threadId })).toEqual({
      threadId,
      parentThreadId: 't',
      parentToolCallId: 'call-1',
      harness: 'test/subagent-children',
      members: [],
      createdAt: expect.any(Number),
      updatedAt: expect.any(Number),
    })
    const children = await host.sessions.list({ parentThreadId: 't' })
    expect(children.entries.map((entry) => entry.threadId)).toEqual([threadId])
    await host.close()
  })

  it('continues a child by sessionId from its stored messages', async () => {
    const lead = mockAdapter([
      () => callWriter({ prompt: 'Take notes' }, 'call-1'),
      () => text('First done.'),
      (options) =>
        callWriter(
          { sessionId: childIdIn(options, 'call-1'), prompt: 'More' },
          'call-2',
        ),
      () => text('Second done.'),
    ])
    const child = mockAdapter([() => text('Note 1'), () => text('Note 2')])
    const { host, session } = await openLead(lead.adapter, child.adapter)

    await session.send('Notes, please')
    await session.send('Add more')

    expect(childIdIn(lead.calls[3], 'call-2')).toBe(
      childIdIn(lead.calls[3], 'call-1'),
    )
    expect(messageTexts(child.calls[1])).toEqual([
      'Take notes',
      'Note 1',
      'More',
    ])
    await host.close()
  })

  it('starts a background child and wakes the session when it ends', async () => {
    const finish = gate()
    const woke = gate()
    const lead = mockAdapter(backgroundLead(woke))
    const child = mockAdapter(after(finish.opened, 'Found it'))
    const { host, session } = await openLead(lead.adapter, child.adapter)

    await session.send('Look around for me')

    expect(toolResultIn(lead.calls[1], 'call-1')).toEqual({
      subagentRunId: expect.any(String),
      result: { status: 'started' },
    })
    finish.open()
    await woke.opened

    expect(messageTexts(child.calls[0]).at(-1)).toBe('Look around')
    expect(messageTexts(lead.calls[2]).at(-1)).toBe(WAKE)
    const threadId = `subagent:${childIdIn(lead.calls[1], 'call-1')}`
    expect(await host.sessions.get({ threadId })).toEqual({
      threadId,
      parentThreadId: 't',
      parentToolCallId: 'call-1',
      harness: 'test/subagent-children',
      members: [],
      createdAt: expect.any(Number),
      updatedAt: expect.any(Number),
    })
    await host.close()
  })

  it('runs and wakes children without a sessions store', async () => {
    const { log, metadata } = memoryPersistence().stores
    const woke = gate()
    const lead = mockAdapter(backgroundLead(woke))
    const child = mockAdapter(() => text('Found it'))
    const { host, session } = await openLead(lead.adapter, child.adapter, {
      stores: { log, metadata },
    })

    await session.send('Look around for me')
    await woke.opened

    expect(messageTexts(lead.calls[2]).at(-1)).toBe(WAKE)
    await host.close()
  })

  it('reads the transcript of a child, only from its own thread', async () => {
    const persistence = memoryPersistence()
    const lead = mockAdapter([
      () => callWriter({ prompt: 'Take notes' }, 'call-1'),
      () => text('Done.'),
    ])
    const child = mockAdapter(() => text('Note 1'))
    const { host, session, harness } = await openLead(
      lead.adapter,
      child.adapter,
      persistence,
    )
    await session.send('Notes, please')
    const id = childIdIn(lead.calls[1], 'call-1')
    // A fork copies the agent result, but the child stays a child of `t`.
    const fork = await host.fork(harness, { threadId: 't', newThreadId: 'f' })

    const transcript = await session.agentTranscript(id)
    expect(
      transcript.map((message) => [message.role, message.content]),
    ).toEqual([
      ['user', 'Take notes'],
      ['assistant', 'Note 1'],
    ])
    expect(await session.agentTranscript('unknown')).toEqual([])
    const other = await host.open(
      defineHarness({
        name: 'test/subagent-children',
        adapter: lead.adapter,
      }),
      {
        threadId: 'u',
      },
    )
    expect(await other.agentTranscript(id)).toEqual([])
    expect(await fork.agentTranscript(id)).toEqual([])
    await host.close()
  })
})
