import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { defineAgent, defineInterrupt, toolDefinition } from '@tanstack/ai'
import { memoryPersistence } from '@tanstack/ai-persistence'
import {
  createHarnessHost,
  defineCommand,
  defineHarness,
  definePlugin,
  isApproval,
} from '../src'
import { appendToLog, mockAdapter, text, toolCall } from './helpers'
import type { AnyChatMiddleware } from '@tanstack/ai'
import type { HarnessPersistence, HarnessRunContext } from '../src'

// Coverage runs in CI are slow, so polled checks wait up to 5 s.
const waitFor = <T>(check: () => T | Promise<T>) =>
  vi.waitFor(check, { timeout: 5_000 })

const THREAD = 't1'
const alice = { id: 'alice' }

/**
 * A harness with one agent, `cleaner`. Its model calls `remove` (which
 * needs an approval), then answers with the text `Done.`.
 */
function cleaning() {
  const removed: Array<string> = []
  const remove = toolDefinition({
    name: 'remove',
    description: 'Remove a file. Needs approval.',
    needsApproval: true,
    inputSchema: z.object({ path: z.string() }),
  }).server(({ path }) => {
    removed.push(path)
    return Promise.resolve({ removed: true })
  })
  const model = mockAdapter([
    () => toolCall('remove', { path: 'old.log' }),
    () => text('Done.'),
  ])
  const cleaner = defineAgent({
    name: 'cleaner',
    description: 'Cleans up',
    run: (ctx) => ctx.chat({ adapter: model.adapter, tools: [remove] }),
  })
  const harness = defineHarness({
    name: 'test/background-waits',
    adapter: mockAdapter([]).adapter,
    agents: [cleaner],
  })
  return { harness, removed, model }
}

async function open(
  harness: ReturnType<typeof cleaning>['harness'],
  persistence: HarnessPersistence,
) {
  const host = createHarnessHost({ persistence })
  const session = await host.open(harness, {
    threadId: THREAD,
    principal: alice,
  })
  return { host, session }
}

describe('a background agent run waits', () => {
  it('suspends on an approval, reports waiting, and goes on after the answer', async () => {
    const { harness, removed } = cleaning()
    const { host, session } = await open(harness, memoryPersistence())

    const run = session.agents.cleaner.start()
    const wait = await session.waitFor({
      runId: run.id,
      signal: AbortSignal.timeout(5_000),
    })
    expect(isApproval(wait)).toBe(true)
    expect(wait).toMatchObject({ runId: run.id, principal: alice })
    expect(session.snapshot().pendingWaits).toEqual([wait])
    expect(session.agentRuns()).toMatchObject([
      { operationId: run.id, status: 'waiting' },
    ])
    // The run does not keep the thread busy while it waits.
    await session.whenIdle({ signal: AbortSignal.timeout(5_000) })
    expect(removed).toEqual([])

    const receipt = await session.resolve({
      resume: [{ interruptId: wait.waitId, status: 'resolved', payload: true }],
    })
    expect(receipt).toMatchObject({ status: 'accepted', operationId: run.id })
    await expect(run).resolves.toBe('Done.')
    expect(removed).toEqual(['old.log'])
    expect(session.snapshot().pendingWaits).toEqual([])
    expect(session.agentRuns()).toMatchObject([
      { operationId: run.id, status: 'completed' },
    ])
    await host.close()
  })

  it('goes on from the log on another host after a restart', async () => {
    const persistence = memoryPersistence()
    const first = cleaning()
    const a = await open(first.harness, persistence)
    const run = a.session.agents.cleaner.start()
    run.then(
      () => {},
      () => {},
    )
    const wait = await a.session.waitFor({ runId: run.id })
    await a.host.close()

    const second = cleaning()
    // The model call before the stop was the first one.
    second.model.calls.push({})
    const b = await open(second.harness, persistence)
    expect(b.session.snapshot().pendingWaits).toEqual([wait])
    expect(b.session.agentRuns()).toMatchObject([
      { operationId: run.id, status: 'waiting' },
    ])

    await b.session.resolve({
      resume: [{ interruptId: wait.waitId, status: 'resolved', payload: true }],
    })
    await waitFor(() =>
      expect(b.session.agentResult({ runId: run.id })).toBe('Done.'),
    )
    expect(second.removed).toEqual(['old.log'])
    expect(b.session.agentRuns()).toMatchObject([
      { operationId: run.id, status: 'completed' },
    ])
    await b.host.close()
  })

  it('ends cancelled, with its waits, on a cancel', async () => {
    const { harness, removed } = cleaning()
    const { host, session } = await open(harness, memoryPersistence())
    const run = session.agents.cleaner.start()
    run.then(
      () => {},
      () => {},
    )
    const wait = await session.waitFor({ runId: run.id })

    await expect(
      session.cancel({ operationId: run.id }),
    ).resolves.toMatchObject({ status: 'accepted' })
    await expect(run).rejects.toThrow()
    expect(run.status()).toBe('cancelled')
    expect(session.snapshot().pendingWaits).toEqual([])
    expect(session.agentRuns()).toMatchObject([
      { operationId: run.id, status: 'cancelled' },
    ])
    expect(removed).toEqual([])
    expect(wait.waitId).toBeTruthy()
    await host.close()
  })
  it('takes a cancel on another host after a restart', async () => {
    const persistence = memoryPersistence()
    const first = cleaning()
    const a = await open(first.harness, persistence)
    const run = a.session.agents.cleaner.start()
    run.then(
      () => {},
      () => {},
    )
    const wait = await a.session.waitFor({ runId: run.id })
    await a.host.close()

    const second = cleaning()
    const b = await open(second.harness, persistence)
    const adopted = b.session.agentRun(run.id)
    expect(adopted?.status()).toBe('interrupted')
    await expect(
      b.session.cancel({ operationId: run.id }),
    ).resolves.toMatchObject({ status: 'accepted' })
    await expect(adopted).rejects.toThrow()
    expect(b.session.snapshot().pendingWaits).toEqual([])
    expect(b.session.agentRuns()).toMatchObject([
      { operationId: run.id, status: 'cancelled' },
    ])
    expect(wait.waitId).toBeTruthy()
    expect(second.removed).toEqual([])
    await b.host.close()
  })

  it('goes on after a restart when the log has the answer and no host resumed it', async () => {
    const persistence = memoryPersistence()
    const first = cleaning()
    const a = await open(first.harness, persistence)
    const run = a.session.agents.cleaner.start()
    run.then(
      () => {},
      () => {},
    )
    const wait = await a.session.waitFor({ runId: run.id })
    await a.host.close()
    // Another host answered, and stopped before it resumed the run.
    await appendToLog(persistence.stores.log, { threadId: THREAD }, [
      {
        type: 'harness.wait.settled',
        waitId: wait.waitId,
        outcome: 'answered',
        value: true,
        at: Date.now(),
      },
    ])

    const second = cleaning()
    second.model.calls.push({})
    const b = await open(second.harness, persistence)
    await waitFor(() =>
      expect(b.session.agentResult({ runId: run.id })).toBe('Done.'),
    )
    expect(second.removed).toEqual(['old.log'])
    await b.host.close()
  })
})

/**
 * A harness with one agent, `triager`. Its tool `list_issues` needs the
 * `github` credential, and waits for the sign-in. `connect:github` saves
 * the credential for the user who runs it.
 */
function triaging() {
  const seen: Array<string> = []
  const failed: Array<string> = []
  const listIssues = toolDefinition({
    name: 'list_issues',
    description: 'List issues',
  }).server(async (_args, ctx) => {
    const { run } = ctx?.context as HarnessRunContext
    try {
      const credential = await run.credentials.require('github', {
        wait: true,
      })
      seen.push(credential.type === 'api_key' ? credential.value : '')
      return ['#1']
    } catch (error) {
      failed.push(error instanceof Error ? error.name : String(error))
      throw error
    }
  })
  const model = mockAdapter([
    () => toolCall('list_issues', {}),
    () => text('One issue.'),
  ])
  const triager = defineAgent({
    name: 'triager',
    description: 'Triages',
    run: (ctx) => ctx.chat({ adapter: model.adapter, tools: [listIssues] }),
  })
  const github = definePlugin({
    name: 'test/github',
    setup: () => ({
      commands: {
        'connect:github': defineCommand({
          description: 'Sign in to GitHub',
          run: (_input, command) =>
            command.credentials.set({
              id: 'github',
              credential: {
                type: 'api_key',
                value: `${command.principal?.id}-key`,
              },
            }),
        }),
      },
    }),
  })
  const harness = defineHarness({
    name: 'test/background-sign-in',
    adapter: mockAdapter([]).adapter,
    agents: [triager],
    plugins: () => [github],
  })
  return { harness, seen, failed }
}

describe('a background agent run waits for a sign-in', () => {
  it('opens a sign-in wait that expires in 15 minutes, and a saved credential resumes the run', async () => {
    const { harness, seen } = triaging()
    const host = createHarnessHost({ persistence: memoryPersistence() })
    const session = await host.open(harness, {
      threadId: THREAD,
      principal: alice,
    })

    const before = Date.now()
    const run = session.agents.triager.start()
    const wait = await session.waitFor({
      runId: run.id,
      signal: AbortSignal.timeout(5_000),
    })
    expect(wait).toMatchObject({ kind: 'sign-in', runId: run.id })
    expect(wait.expiresAt).toBeGreaterThanOrEqual(before + 15 * 60_000)
    expect(seen).toEqual([])

    await session.command({ name: 'connect:github' })
    await expect(run).resolves.toBe('One issue.')
    expect(seen).toEqual(['alice-key'])
    expect(session.snapshot().pendingWaits).toEqual([])
    await host.close()
  })

  it('fails the tool when the user cancels the sign-in', async () => {
    const { harness, seen, failed } = triaging()
    const host = createHarnessHost({ persistence: memoryPersistence() })
    const session = await host.open(harness, {
      threadId: THREAD,
      principal: alice,
    })
    const run = session.agents.triager.start()
    const wait = await session.waitFor({ runId: run.id })

    await session.resolve({
      resume: [{ interruptId: wait.waitId, status: 'cancelled' }],
    })
    await expect(run).resolves.toBe('One issue.')
    expect(seen).toEqual([])
    expect(failed.at(-1)).toBe('AuthRequiredError')
    await host.close()
  })
})

/** An app interrupt that asks a person to review. */
const review = defineInterrupt({
  id: 'test/review',
  responseSchema: z.object({ ok: z.boolean() }),
})

describe('a wait with expiresAt', () => {
  it('ends expired on time, and the background run that waits for it ends', async () => {
    const model = mockAdapter([() => toolCall('remove', { path: 'a' })])
    // The run stops for a review before its tools run, once.
    let isAsked = false
    const asker: AnyChatMiddleware = {
      name: 'test/review',
      onInterruptBoundary: (run) => {
        if (run.phase !== 'beforeTools' || isAsked) return undefined
        isAsked = true
        return {
          interrupts: [
            review.interrupt({
              key: 'review-1',
              reason: 'review',
              message: 'Review the plan.',
              expiresAt: new Date(Date.now() + 200).toISOString(),
            }),
          ],
        }
      },
    }
    const remove = toolDefinition({
      name: 'remove',
      description: 'Remove a file',
      inputSchema: z.object({ path: z.string() }),
    }).server(() => Promise.resolve({ removed: true }))
    const reviewer = defineAgent({
      name: 'reviewer',
      description: 'Reviews',
      run: (ctx) =>
        ctx.chat({
          adapter: model.adapter,
          tools: [remove],
          interrupts: [review],
          middleware: [asker],
        }),
    })
    const host = createHarnessHost({ persistence: memoryPersistence() })
    const session = await host.open(
      defineHarness({
        name: 'test/background-expiry',
        adapter: mockAdapter([]).adapter,
        agents: [reviewer],
      }),
      { threadId: THREAD, principal: alice },
    )
    const run = session.agents.reviewer.start()
    run.then(
      () => {},
      () => {},
    )
    const wait = await session.waitFor({ runId: run.id })
    expect(wait).toMatchObject({ kind: 'human', runId: run.id })
    expect(wait.expiresAt).toBeLessThanOrEqual(Date.now() + 200)

    await waitFor(() => expect(run.status()).toBe('failed'))
    expect(session.snapshot().pendingWaits).toEqual([])
    expect(session.agentRuns()).toMatchObject([
      { operationId: run.id, status: 'failed' },
    ])
    await host.close()
  })
})
