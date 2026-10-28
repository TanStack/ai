import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { toolDefinition } from '@tanstack/ai'
import {
  NO_OWNER_EPOCH,
  memoryLogStore,
  memoryPersistence,
} from '@tanstack/ai-persistence'
import { createHarnessHost, defineHarness, logIdOf } from '../src'
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

/**
 * A log and metadata: a host that opens the thread after another one
 * closed takes it at once, as after a restart.
 */
function persistenceFor() {
  const { metadata } = memoryPersistence().stores
  return { stores: { log: memoryLogStore(), metadata } }
}

const contents = (messages: ReadonlyArray<{ content: unknown }>) =>
  messages.map((message) =>
    typeof message.content === 'string'
      ? message.content
      : JSON.stringify(message.content),
  )

describe('reset', () => {
  async function open(replies: Array<Reply>, extra = {}) {
    const { adapter, calls } = mockAdapter(replies)
    const persistence = persistenceFor()
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
    await session.send('First.')
    const receipt = await session.reset({
      note: 'We agreed on plan B.',
      inputId: 'r1',
    })
    expect(receipt).toMatchObject({ status: 'accepted' })
    expect(await session.settled({ inputId: 'r1' })).toMatchObject({
      outcome: 'completed',
    })
    await session.send('Second.')

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
    await session.send('First.')
    await session.reset()
    await session.send('Second.')

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
    await session.send('First.')
    await session.reset({ note: 'Note.' })
    await session.send('Second.')
    await session.send('Third.')
    await session.send('Fourth.')

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
    const first = session.send('First.')
    // Queued while the first turn runs, before the reset.
    const second = session.send('Second.')
    const receipt = await session.reset({ note: 'Note.' })
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
    await session.send('First.')
    await session.reset({ note: 'Note.' })
    const turn = session.send('Second.')
    await started.opened
    // Joins at the model call after the tool.
    await session.send('Also this.', { mode: 'steer' }).receipt
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
    await session.send('First.')
    await session.reset({ note: 'Note.' })
    await session.send('Second.')

    expect(seen.at(-1)).toEqual(['Note.', 'Second.'])
    await host.close()
  })

  it('runs once for the same inputId and refuses another note', async () => {
    const { session, host } = await open([() => text('One.')])
    await session.send('First.')
    await session.reset({ note: 'Note.', inputId: 'r1' })
    await session.settled({ inputId: 'r1' })
    expect(await session.reset({ note: 'Note.', inputId: 'r1' })).toMatchObject(
      {
        status: 'accepted',
      },
    )
    expect(
      await session.reset({ note: 'Other.', inputId: 'r1' }),
    ).toMatchObject({
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
    await session.send('Deploy.')
    expect(await session.reset({ note: 'Note.' })).toMatchObject({
      status: 'rejected',
      reason: 'pending_interrupts',
    })
    await host.close()
  })
})

describe('reset after a restart', () => {
  it('keeps the cut context after a restart', async () => {
    const persistence = persistenceFor()
    const first = mockAdapter([() => text('One.')])
    const hostA = createHarnessHost({ persistence })
    const sessionA = await hostA.open(
      defineHarness({ name: 'test/reset', adapter: first.adapter }),
      {
        threadId: 't1',
      },
    )
    await sessionA.send('First.')
    await sessionA.reset({ note: 'Note.', inputId: 'r1' })
    await sessionA.settled({ inputId: 'r1' })
    await hostA.close()

    const second = mockAdapter([() => text('Two.')])
    const hostB = createHarnessHost({ persistence })
    const sessionB = await hostB.open(
      defineHarness({ name: 'test/reset', adapter: second.adapter }),
      {
        threadId: 't1',
      },
    )
    await sessionB.send('Second.')
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
    const { metadata } = memoryPersistence().stores
    const persistence = { stores: { log, metadata } }
    await log.append({
      logId: logIdOf({ logId: 't1' }),
      seq: 1,
      epoch: NO_OWNER_EPOCH,
      records: [
        {
          type: 'harness.input',
          inputId: 'r1',
          input: { op: 'reset', note: 'Note.' },
          at: Date.now(),
        },
      ],
    })
    const { adapter, calls } = mockAdapter([() => text('Two.')])
    const host = createHarnessHost({ persistence })
    const session = await host.open(
      defineHarness({ name: 'test/reset', adapter }),
      {
        threadId: 't1',
      },
    )
    expect(await session.settled({ inputId: 'r1' })).toMatchObject({
      outcome: 'completed',
    })
    await session.send('Second.')
    expect(messageTexts(calls[0])).toEqual(['Note.', 'Second.'])
    await host.close()
  })
})
