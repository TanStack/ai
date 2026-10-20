import { describe, expect, it, vi } from 'vitest'
import { defineAgent, toolDefinition } from '@tanstack/ai'
import {
  memoryLogState,
  memoryLogStore,
  memoryPersistence,
} from '@tanstack/ai-persistence'
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

const MOVED =
  'The job moved to the background. Its id is call-1. You get a note when it ends.'

/** Open thread `t` of a harness with `options`. */
async function open(
  adapter: AnyTextAdapter,
  options: Omit<Parameters<typeof defineHarness>[0], 'name' | 'adapter'> = {},
) {
  const host = createHarnessHost({ persistence: memoryPersistence() })
  const session = await host.open(
    defineHarness({ name: 'test/background', adapter, ...options }),
    {
      threadId: 't',
    },
  )
  return { host, session }
}

/** The text of the tool result for call `id` that model call `call` got. */
function toolResultIn(call: { messages: Array<ModelMessage> }, id: string) {
  const message = call.messages.find(
    (entry) => entry.role === 'tool' && entry.toolCallId === id,
  )
  return String(message?.content)
}

/** Lead replies: call `name` with `args`, answer, then answer the wake. */
function lead(
  name: string,
  args: Record<string, unknown>,
  woke: { open: () => void },
) {
  return [
    () => toolCall(name, args, 'call-1'),
    () => text('Moved.'),
    () => {
      woke.open()
      return text('Got it.')
    },
  ]
}

describe('session.background', () => {
  it('moves a running subagent to the background', async () => {
    const finish = gate()
    const woke = gate()
    const child = mockAdapter(after(finish.opened, 'Found it'))
    const writer = defineAgent({
      name: 'writer',
      description: 'Writes notes',
      run: (ctx) => ctx.chat({ adapter: child.adapter }),
    })
    const model = mockAdapter(lead('writer', { prompt: 'Look around' }, woke))
    const { host, session } = await open(model.adapter, {
      subagents: { agents: [writer] },
    })

    const turn = session.send('Look around for me')
    await vi.waitFor(() => expect(child.calls).toHaveLength(1))
    expect(await session.moveToolCallToBackground()).toMatchObject({
      status: 'accepted',
    })
    await turn

    expect(JSON.parse(toolResultIn(model.calls[1], 'call-1'))).toEqual({
      result: MOVED,
    })
    finish.open()
    await woke.opened
    const note = messageTexts(model.calls[2]).at(-1) ?? ''
    expect(note.split('\n')[0]).toBe('Background job call-1 ended.')
    expect(JSON.parse(note.split('\n')[1] ?? '')).toMatchObject({
      text: 'Found it',
    })
    await host.close()
  })

  it('keeps a session with a running job open after its last handle closes', async () => {
    const finish = gate()
    const woke = gate()
    const child = mockAdapter(after(finish.opened, 'Found it'))
    const writer = defineAgent({
      name: 'writer',
      description: 'Writes notes',
      run: (ctx) => ctx.chat({ adapter: child.adapter }),
    })
    const model = mockAdapter(lead('writer', { prompt: 'Look around' }, woke))
    const harness = defineHarness({
      name: 'test/background',
      adapter: model.adapter,
      subagents: { agents: [writer] },
    })
    const host = createHarnessHost({
      persistence: memoryPersistence(),
      lifecycle: { closeIdleSessionsAfterMs: 0 },
    })
    const session = await host.open(harness, { threadId: 't' })

    const turn = session.send('Look around for me')
    await vi.waitFor(() => expect(child.calls).toHaveLength(1))
    expect(await session.moveToolCallToBackground()).toMatchObject({
      status: 'accepted',
    })
    await turn
    // No handle holds the session now, but its job still runs.
    await session.close()
    expect(host.isOpen(harness, { threadId: 't' })).toBe(true)

    finish.open()
    await woke.opened
    const note = messageTexts(model.calls[2]).at(-1) ?? ''
    expect(note.split('\n')[0]).toBe('Background job call-1 ended.')
    // After the job and its note, the session is idle and closes.
    await vi.waitFor(
      () => expect(host.isOpen(harness, { threadId: 't' })).toBe(false),
      { timeout: 5_000 },
    )
    await host.close()
  })

  it('opens on another host while the owner runs a job', async () => {
    const logState = memoryLogState()
    const finish = gate()
    const woke = gate()
    const child = mockAdapter(after(finish.opened, 'Found it'))
    const writer = defineAgent({
      name: 'writer',
      description: 'Writes notes',
      run: (ctx) => ctx.chat({ adapter: child.adapter }),
    })
    const model = mockAdapter(lead('writer', { prompt: 'Look around' }, woke))
    const harnessOf = (adapter: AnyTextAdapter) =>
      defineHarness({
        name: 'test/background',
        adapter,
        subagents: { agents: [writer] },
      })
    const hostOf = () =>
      createHarnessHost({
        persistence: { stores: { log: memoryLogStore({ state: logState }) } },
      })
    const owner = hostOf()
    const session = await owner.open(harnessOf(model.adapter), {
      threadId: 't',
    })
    const turn = session.send('Look around for me')
    await vi.waitFor(() => expect(child.calls).toHaveLength(1))
    expect(await session.moveToolCallToBackground()).toMatchObject({
      status: 'accepted',
    })
    await turn

    // The job runs on the owner, so the other host notes nothing.
    const other = hostOf()
    const reader = await other.open(harnessOf(mockAdapter([]).adapter), {
      threadId: 't',
    })
    expect(
      (await reader.transcript()).some((message) =>
        String(message.content).includes('stopped when the host restarted'),
      ),
    ).toBe(false)

    finish.open()
    await woke.opened
    const note = messageTexts(model.calls[2]).at(-1) ?? ''
    expect(note.split('\n')[0]).toBe('Background job call-1 ended.')
    await owner.close()
    await other.close()
  })

  it('leaves a tool without support running', async () => {
    const finish = gate()
    const started = gate()
    const wait = toolDefinition({
      name: 'wait',
      description: 'Waits',
      inputSchema: { type: 'object', properties: {} },
    }).server(async () => {
      started.open()
      await finish.opened
      return 'waited'
    })
    const model = mockAdapter([
      () => toolCall('wait', {}, 'call-1'),
      () => text('Done.'),
    ])
    const { host, session } = await open(model.adapter, { tools: [wait] })

    const turn = session.send('Wait')
    await started.opened
    expect(await session.moveToolCallToBackground()).toMatchObject({
      status: 'rejected',
      reason: 'not_running',
    })
    finish.open()
    await turn

    expect(toolResultIn(model.calls[1], 'call-1')).toBe('waited')
    await host.close()
  })
})
