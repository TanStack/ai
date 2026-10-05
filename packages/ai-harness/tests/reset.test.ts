import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { toolDefinition } from '@tanstack/ai'
import { memoryLogStore, memoryPersistence } from '@tanstack/ai-persistence'
import { createHarnessHandler, createHarnessHost, defineHarness } from '../src'
import { messagesFromTranscript } from '../src/view/reduce'
import {
  after,
  gate,
  messageTexts,
  mockAdapter,
  text,
  toolCall,
} from './helpers'
import type { AnyChatMiddleware } from '@tanstack/ai'
import type { Reply } from './helpers'

/** The stores of a host without a log, or of a durable host. */
function persistenceFor(durable: boolean) {
  const { stores } = memoryPersistence()
  if (!durable) return { stores }
  const { runs, metadata } = stores
  return { stores: { log: memoryLogStore(), runs, metadata } }
}

const contents = (messages: ReadonlyArray<{ content: unknown }>) =>
  messages.map((message) =>
    typeof message.content === 'string'
      ? message.content
      : JSON.stringify(message.content),
  )

describe.each([
  { host: 'a host without a log', durable: false },
  { host: 'a durable host', durable: true },
])('reset on $host', ({ durable }) => {
  async function open(replies: Array<Reply>, extra = {}) {
    const { adapter, calls } = mockAdapter(replies)
    const persistence = persistenceFor(durable)
    const host = createHarnessHost({ persistence })
    const harness = defineHarness({ name: 'test/reset', adapter, ...extra })
    const session = await host.open(harness, { threadId: 't1' })
    return { session, calls, host, harness, persistence }
  }

  it('gives the next model call only the note and the new message', async () => {
    const { session, calls, host } = await open([
      () => text('One.'),
      () => text('Two.'),
    ])
    await session.prompt('First.')
    const receipt = await session.reset('We agreed on plan B.', {
      inputId: 'r1',
    })
    expect(receipt).toMatchObject({ status: 'accepted' })
    expect(await session.settled('r1')).toMatchObject({ outcome: 'completed' })
    await session.prompt('Second.')

    expect(messageTexts(calls[1])).toEqual(['We agreed on plan B.', 'Second.'])
    // The transcript keeps every message, with the marker.
    const transcript = await session.transcript()
    expect(contents(transcript)).toEqual([
      'First.',
      'One.',
      'We agreed on plan B.',
      'Second.',
      'Two.',
    ])
    expect(transcript[2]?.metadata?.harness?.reset).toEqual({
      note: 'We agreed on plan B.',
    })
    await host.close()
  })

  it('gives the model only the new message without a note', async () => {
    const { session, calls, host } = await open([
      () => text('One.'),
      () => text('Two.'),
    ])
    await session.prompt('First.')
    await session.reset()
    await session.prompt('Second.')

    expect(messageTexts(calls[1])).toEqual(['Second.'])
    const transcript = await session.transcript()
    expect(contents(transcript)).toEqual([
      'First.',
      'One.',
      '',
      'Second.',
      'Two.',
    ])
    expect(transcript[2]?.metadata?.harness?.reset).toEqual({})
    await host.close()
  })

  it('keeps the old messages in the transcript after more turns', async () => {
    const { session, calls, host } = await open([
      () => text('One.'),
      () => text('Two.'),
      () => text('Three.'),
      () => text('Four.'),
    ])
    await session.prompt('First.')
    await session.reset('Note.')
    await session.prompt('Second.')
    await session.prompt('Third.')
    await session.prompt('Fourth.')

    expect(messageTexts(calls[3])).toEqual([
      'Note.',
      'Second.',
      'Two.',
      'Third.',
      'Three.',
      'Fourth.',
    ])
    expect(contents(await session.transcript()).slice(0, 3)).toEqual([
      'First.',
      'One.',
      'Note.',
    ])
    await host.close()
  })

  it('waits for the running turn, then applies before the next queued turn', async () => {
    const release = gate()
    const { session, calls, host } = await open([
      after(release.opened, 'One.'),
      () => text('Two.'),
    ])
    const first = session.prompt('First.')
    // Queued while the first turn runs, before the reset.
    const second = session.prompt('Second.')
    const receipt = await session.reset('Note.')
    expect(receipt).toMatchObject({ status: 'queued' })
    release.open()
    await Promise.all([first, second])

    // The running turn kept its context. The queued turn got the cut one.
    expect(messageTexts(calls[0])).toEqual(['First.'])
    expect(messageTexts(calls[1])).toEqual(['Note.', 'Second.'])
    expect(contents(await session.transcript())).toEqual([
      'First.',
      'One.',
      'Note.',
      'Second.',
      'Two.',
    ])
    await host.close()
  })

  it('keeps the cut when a steer joins the turn', async () => {
    const started = gate()
    const release = gate()
    const lookup = toolDefinition({
      name: 'lookup',
      description: 'Look something up',
      inputSchema: z.object({}),
    }).server(async () => {
      started.open()
      await release.opened
      return { found: true }
    })
    const { session, calls, host } = await open(
      [() => text('One.'), () => toolCall('lookup', {}), () => text('Two.')],
      { tools: [lookup] },
    )
    await session.prompt('First.')
    await session.reset('Note.')
    const turn = session.prompt('Second.')
    await started.opened
    // Joins at the model call after the tool.
    await session.steer('Also this.')
    release.open()
    await turn

    expect(messageTexts(calls[2])).toEqual([
      'Note.',
      'Second.',
      'null',
      '{"found":true}',
      'Also this.',
    ])
    await host.close()
  })

  it('shows only the new context to the harness middleware', async () => {
    const seen: Array<Array<string>> = []
    const watch: AnyChatMiddleware = {
      name: 'test/watch',
      onConfig: (ctx, config) => {
        if (ctx.phase === 'beforeModel') {
          seen.push(contents(config.providerMessages ?? config.messages))
        }
      },
    }
    const { session, host } = await open(
      [() => text('One.'), () => text('Two.')],
      { middleware: [watch] },
    )
    await session.prompt('First.')
    await session.reset('Note.')
    await session.prompt('Second.')

    expect(seen.at(-1)).toEqual(['Note.', 'Second.'])
    await host.close()
  })

  it('runs once for the same inputId and refuses another note', async () => {
    const { session, host } = await open([() => text('One.')])
    await session.prompt('First.')
    await session.reset('Note.', { inputId: 'r1' })
    await session.settled('r1')
    expect(await session.reset('Note.', { inputId: 'r1' })).toMatchObject({
      status: 'accepted',
    })
    expect(await session.reset('Other.', { inputId: 'r1' })).toMatchObject({
      status: 'rejected',
      reason: 'conflict',
    })
    const markers = (await session.transcript()).filter(
      (message) => message.metadata?.harness?.reset,
    )
    expect(markers).toHaveLength(1)
    await host.close()
  })

  it('refuses a reset while the thread waits for interrupts', async () => {
    const deploy = toolDefinition({
      name: 'deploy',
      description: 'Deploy. Needs approval.',
      needsApproval: true,
      inputSchema: z.object({}),
    }).server(async () => ({ ok: true }))
    const { session, host } = await open([() => toolCall('deploy', {})], {
      tools: [deploy],
    })
    await session.prompt('Deploy.')
    expect(await session.reset('Note.')).toMatchObject({
      status: 'rejected',
      reason: 'pending_interrupts',
    })
    await host.close()
  })

  it('takes the reset input over HTTP, as the request principal', async () => {
    const { session, calls, host, harness } = await open([
      () => text('One.'),
      () => text('Two.'),
    ])
    await session.prompt('First.')
    const handler = createHarnessHandler({
      host,
      harness,
      authorize: () => ({ id: 'ada' }),
    })
    const response = await handler(
      new Request('http://h.test/control', {
        method: 'POST',
        body: JSON.stringify({
          threadId: 't1',
          input: { op: 'reset', note: 'Note.', inputId: 'r1' },
        }),
      }),
    )
    expect(await response.json()).toMatchObject({ status: 'accepted' })
    await session.settled('r1')
    await session.prompt('Second.')
    expect(messageTexts(calls[1])).toEqual(['Note.', 'Second.'])
    await host.close()
  })
})

describe('reset on a durable host', () => {
  it('keeps the cut context after a restart', async () => {
    const persistence = persistenceFor(true)
    const first = mockAdapter([() => text('One.')])
    const hostA = createHarnessHost({ persistence })
    const sessionA = await hostA.open(
      defineHarness({ name: 'test/reset', adapter: first.adapter }),
      { threadId: 't1' },
    )
    await sessionA.prompt('First.')
    await sessionA.reset('Note.', { inputId: 'r1' })
    await sessionA.settled('r1')
    await hostA.close()

    const second = mockAdapter([() => text('Two.')])
    const hostB = createHarnessHost({ persistence })
    const sessionB = await hostB.open(
      defineHarness({ name: 'test/reset', adapter: second.adapter }),
      { threadId: 't1' },
    )
    await sessionB.prompt('Second.')
    expect(messageTexts(second.calls[0])).toEqual(['Note.', 'Second.'])
    expect(contents(await sessionB.transcript())).toEqual([
      'First.',
      'One.',
      'Note.',
      'Second.',
      'Two.',
    ])
    await hostB.close()
  })

  it('applies a reset that a crash left in the log', async () => {
    const log = memoryLogStore()
    const { runs, metadata } = memoryPersistence().stores
    const persistence = { stores: { log, runs, metadata } }
    await log.append('t1', 1, [
      {
        type: 'harness.input',
        inputId: 'r1',
        input: { op: 'reset', note: 'Note.' },
        at: Date.now(),
      },
    ])
    const { adapter, calls } = mockAdapter([() => text('Two.')])
    const host = createHarnessHost({ persistence })
    const session = await host.open(
      defineHarness({ name: 'test/reset', adapter }),
      { threadId: 't1' },
    )
    expect(await session.settled('r1')).toMatchObject({ outcome: 'completed' })
    await session.prompt('Second.')
    expect(messageTexts(calls[0])).toEqual(['Note.', 'Second.'])
    await host.close()
  })
})

describe('the session view', () => {
  it('shows the reset marker of a transcript as a notice', () => {
    const messages = messagesFromTranscript([
      { id: 'u1', role: 'user', content: 'First.' },
      {
        id: 'reset-r1',
        role: 'user',
        content: 'Note.',
        metadata: { harness: { reset: { note: 'Note.' } } },
      },
    ])
    expect(messages[1]).toMatchObject({
      role: 'notice',
      kind: 'info',
      text: expect.stringContaining('Note.'),
    })
  })
})
