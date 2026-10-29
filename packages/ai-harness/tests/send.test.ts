import { describe, expect, it } from 'vitest'
import { toolDefinition } from '@tanstack/ai'
import { memoryPersistence } from '@tanstack/ai-persistence'
import { InputRejectedError, createHarnessHost, defineHarness } from '../src'
import { after, gate, mockAdapter, text, toolCall } from './helpers'
import type { Reply } from './helpers'
import type { AnyTool } from '@tanstack/ai'

async function open(replies: Array<Reply>, tools: Array<AnyTool> = []) {
  const { adapter, calls } = mockAdapter(replies)
  const host = createHarnessHost({ persistence: memoryPersistence() })
  const session = await host.open(
    defineHarness({ name: 'test/send', adapter, tools }),
    {
      threadId: 't1',
    },
  )
  return { host, session, calls }
}

describe('session.send', () => {
  it('a steer ends with the turn it joined, and gets its result', async () => {
    const started = gate()
    const done = gate()
    const wait = toolDefinition({ name: 'wait', description: 'Wait' }).server(
      async () => {
        started.open()
        await done.opened
        return 'waited'
      },
    )
    const { session, calls } = await open(
      [() => toolCall('wait', {}), () => text('both answered')],
      [wait],
    )
    const turn = session.send('first', { inputId: 'host' })
    await started.opened
    const steer = session.send('also this', { mode: 'steer', inputId: 'join' })
    expect(await steer.receipt).toMatchObject({
      status: 'accepted',
      operationId: turn.id,
    })
    expect(steer.status()).toBe('accepted')
    done.open()
    expect((await steer).text).toBe('both answered')
    expect((await turn).text).toBe('both answered')
    expect(calls).toHaveLength(2)
    expect(await session.settled({ inputId: 'join' })).toMatchObject({
      outcome: 'completed',
      operationId: turn.id,
    })
  })

  it('a follow-up queues behind the running turn', async () => {
    const release = gate()
    const { session } = await open([
      after(release.opened, 'first answer'),
      () => text('second answer'),
    ])
    const first = session.send('first')
    await first.receipt
    const next = session.send('then this', { mode: 'followUp' })
    expect(await next.receipt).toMatchObject({ status: 'queued' })
    release.open()
    expect((await first).text).toBe('first answer')
    expect((await next).text).toBe('second answer')
  })

  it('a message to an unknown agent run is rejected with not_running', async () => {
    const { session } = await open([])
    const sent = session.send('Hello.', { to: 'op-agent-none', inputId: 'x' })
    expect(await sent.receipt).toEqual({
      inputId: 'x',
      status: 'rejected',
      reason: 'not_running',
    })
    await expect(sent).rejects.toBeInstanceOf(InputRejectedError)
    expect(sent.status()).toBe('failed')
  })
})
