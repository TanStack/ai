import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { defineAgent, toolDefinition } from '@tanstack/ai'
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
import type { AnyTextAdapter } from '@tanstack/ai'
import type { AnyHarness } from '../src'

const THREAD = 't1'
const alice = { id: 'alice' }

/** Open `harness` for alice on a host without a log. */
async function open<THarness extends AnyHarness>(
  harness: THarness,
  persistence = memoryPersistence(),
) {
  const host = createHarnessHost({ persistence })
  const session = await host.open(harness, {
    threadId: THREAD,
    principal: alice,
  })
  return { host, session }
}

/** An agent whose one `ctx.chat` gets the messages of its run. */
const writer = (adapter: AnyTextAdapter) =>
  defineAgent({
    name: 'writer',
    description: 'Writes',
    run: (ctx) => ctx.chat({ adapter }),
  })

/** A harness whose one agent is `writer` on `adapter`. */
const writing = (adapter: AnyTextAdapter) =>
  defineHarness({
    name: 'test/agent-runs',
    adapter: mockAdapter([]).adapter,
    agents: [writer(adapter)],
  })

/**
 * `researcher` calls `lookup` in its first model call. The tool waits for
 * `release`, so a test can send a message before the second model call.
 */
function researching(replies: Parameters<typeof mockAdapter>[0]) {
  const release = gate()
  const lookup = toolDefinition({
    name: 'lookup',
    description: 'Look it up',
    inputSchema: z.object({}),
  }).server(async () => {
    await release.opened
    return { found: true }
  })
  const model = mockAdapter(replies)
  const researcher = defineAgent({
    name: 'researcher',
    description: 'Researches',
    run: (ctx) => ctx.chat({ adapter: model.adapter, tools: [lookup] }),
  })
  const harness = defineHarness({
    name: 'test/agent-runs',
    adapter: mockAdapter([]).adapter,
    agents: [researcher],
  })
  return { release, model, harness }
}

describe('the thread of an agent run', () => {
  it('keeps the messages of each background run in a thread of its own', async () => {
    const persistence = memoryPersistence()
    const model = mockAdapter([() => text('Drafted.')])
    let thread = ''
    const drafter = defineAgent({
      name: 'drafter',
      description: 'Drafts',
      run: (ctx) => {
        thread = ctx.threadId
        return ctx.chat({
          adapter: model.adapter,
          messages: [{ role: 'user', content: 'Draft it.' }],
        })
      },
    })
    const { host, session } = await open(
      defineHarness({
        name: 'test/agent-runs',
        adapter: mockAdapter([]).adapter,
        agents: [drafter],
      }),
      persistence,
    )

    await session.agents.drafter.start()

    expect(thread).toMatch(/^t1:drafter:in-/)
    const saved = JSON.stringify(
      await persistence.stores.messages.loadThread(thread),
    )
    expect(saved).toContain('Draft it.')
    expect(saved).toContain('Drafted.')
    await host.close()
  })
})

describe('follow-ups to an agent run', () => {
  it('runs the agent again after the run ended, on its transcript', async () => {
    const model = mockAdapter([
      () => text('Draft one.'),
      () => text('Draft two.'),
    ])
    const { host, session } = await open(writing(model.adapter))
    const run = session.agents.writer.start()
    await run

    const receipt = await run.send('Make it shorter.', { mode: 'followUp' })

    expect(receipt.status).toBe('accepted')
    expect(receipt.operationId).not.toBe(run.id)
    await expect(session.operation(receipt.operationId ?? '')).resolves.toBe(
      'Draft two.',
    )
    const texts = messageTexts(model.calls[1])
    expect(texts).toContain('Draft one.')
    expect(texts.at(-1)).toBe('Make it shorter.')
    await host.close()
  })

  it('runs a follow-up that comes during the run after it, once per input id', async () => {
    const release = gate()
    const model = mockAdapter([
      after(release.opened, 'Draft one.'),
      () => text('Draft two.'),
    ])
    const { host, session } = await open(writing(model.adapter))
    const run = session.agents.writer.start()
    await vi.waitFor(() => expect(model.calls).toHaveLength(1))

    const receipt = await run.send('Add a title.', {
      mode: 'followUp',
      inputId: 'follow-1',
    })
    const retry = await run.send('Add a title.', {
      mode: 'followUp',
      inputId: 'follow-1',
    })

    expect(receipt.status).toBe('queued')
    expect(retry).toEqual(receipt)
    expect(session.operation(receipt.operationId ?? '')?.status()).toBe(
      'accepted',
    )
    release.open()
    await expect(run).resolves.toBe('Draft one.')
    await expect(session.operation(receipt.operationId ?? '')).resolves.toBe(
      'Draft two.',
    )
    expect(model.calls).toHaveLength(2)
    expect(messageTexts(model.calls[1]).at(-1)).toBe('Add a title.')
    await host.close()
  })

  it('runs a steer that the run never took as a follow-up', async () => {
    const release = gate()
    const model = mockAdapter([
      after(release.opened, 'Draft one.'),
      () => text('Draft two.'),
    ])
    const { host, session } = await open(writing(model.adapter))
    const run = session.agents.writer.start()
    await vi.waitFor(() => expect(model.calls).toHaveLength(1))

    const receipt = await run.send('Use a warmer tone.')

    expect(receipt).toMatchObject({ status: 'accepted', operationId: run.id })
    release.open()
    await run
    await vi.waitFor(() => expect(model.calls).toHaveLength(2))
    expect(messageTexts(model.calls[1]).at(-1)).toBe('Use a warmer tone.')
    expect(await session.settled(receipt.inputId)).toMatchObject({
      outcome: 'completed',
    })
    await host.close()
  })

  it('refuses a message to a run it does not know', async () => {
    const { host, session } = await open(writing(mockAdapter([]).adapter))

    expect(await session.sendToAgent('op-agent-none', 'Hello.')).toMatchObject({
      status: 'rejected',
      reason: 'not_running',
    })
    await host.close()
  })
})

describe('steers to an agent run', () => {
  it('joins the next model call of the run, and settles with it', async () => {
    const { release, model, harness } = researching([
      () => toolCall('lookup', {}),
      () => text('Done.'),
    ])
    const { host, session } = await open(harness)
    const run = session.agents.researcher.start()
    await vi.waitFor(() => expect(model.calls).toHaveLength(1))

    const receipt = await run.send('Only primary sources.')
    release.open()
    await run

    expect(receipt).toMatchObject({ status: 'accepted', operationId: run.id })
    expect(model.calls).toHaveLength(2)
    expect(messageTexts(model.calls[1]).at(-1)).toBe('Only primary sources.')
    expect(await session.settled(receipt.inputId)).toMatchObject({
      outcome: 'completed',
      operationId: run.id,
    })
    await host.close()
  })

  it('runs a steer from another sender as a follow-up, for that sender', async () => {
    const { release, model, harness } = researching([
      () => toolCall('lookup', {}),
      () => text('Done.'),
      () => text('Noted.'),
    ])
    const { host, session } = await open(harness)
    const run = session.agents.researcher.start()
    await vi.waitFor(() => expect(model.calls).toHaveLength(1))

    const receipt = await session.sendToAgent(run.id, 'Ignore the brief.', {
      principal: { id: 'bob' },
    })
    release.open()
    await run
    await vi.waitFor(() => expect(model.calls).toHaveLength(3))

    expect(receipt.status).toBe('queued')
    expect(receipt.operationId).not.toBe(run.id)
    expect(messageTexts(model.calls[1])).not.toContain('Ignore the brief.')
    expect(messageTexts(model.calls[2]).at(-1)).toBe('Ignore the brief.')
    await host.close()
  })
})
