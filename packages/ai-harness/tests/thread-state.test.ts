import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { defineAgent, toolDefinition } from '@tanstack/ai'
import { memoryPersistence } from '@tanstack/ai-persistence'
import {
  configOption,
  createHarnessHost,
  defineCommand,
  defineHarness,
  definePlugin,
} from '../src'
import {
  CRASHING_OWNERSHIP,
  messageTexts,
  mockAdapter,
  ownershipExpired,
  storedThreadState,
  text,
  toolCall,
  turnInterrupts,
  untilAborted,
} from './helpers'
import type { ModelMessage, ReasoningRequest } from '@tanstack/ai'
import type { HarnessConfig, OwnershipOptions } from '../src'
import type { Reply } from './helpers'

// Coverage runs in CI are slow, so polled checks wait up to 5 s.
const waitFor = <T>(
  check: () => T | Promise<T>,
  options?: { timeout?: number; interval?: number },
) => vi.waitFor(check, { timeout: 5_000, ...options })

const THREAD = 't1'
const alice = { id: 'alice' }
const HIGH: ReasoningRequest = { level: 'high', summary: true }

/**
 * Memory stores, as two servers share them, and the metadata namespaces
 * that the harness writes. Thread state goes to the log, so the list stays
 * empty. A server that stopped owns its logs until the ownership expires.
 */
function sharedStores() {
  const { log, metadata } = memoryPersistence().stores
  const persistence = { stores: { log, metadata } }
  const written: Array<string> = []
  const record = (namespace: string) => {
    written.push(namespace)
  }
  const { setIf } = metadata
  if (!setIf) throw new Error('The memory store has compare-and-set.')
  const set = metadata.set.bind(metadata)
  const remove = metadata.delete.bind(metadata)
  vi.spyOn(metadata, 'set').mockImplementation((namespace, key, value) => {
    record(namespace)
    return set(namespace, key, value)
  })
  vi.spyOn(metadata, 'setIf').mockImplementation(
    (namespace, key, value, revision) => {
      record(namespace)
      return setIf.call(metadata, namespace, key, value, revision)
    },
  )
  vi.spyOn(metadata, 'delete').mockImplementation((namespace, key) => {
    record(namespace)
    return remove(namespace, key)
  })
  return { persistence, written }
}

type Shared = ReturnType<typeof sharedStores>

/** Open thread `THREAD` for alice on a new host: a server that starts. */
async function openOn(
  { persistence }: Shared,
  config: Omit<HarnessConfig, 'name' | 'adapter'>,
  replies: Array<Reply> = [],
  ownership?: OwnershipOptions,
) {
  const model = mockAdapter(replies)
  const host = createHarnessHost({
    persistence,
    ...(ownership ? { ownership } : {}),
  })
  const session = await host.open(
    defineHarness({
      name: 'test/thread-state',
      adapter: model.adapter,
      ...config,
    }),
    { threadId: THREAD, user: alice },
  )
  return { host, session, calls: model.calls }
}

const level = definePlugin({
  name: 'test/level',
  setup: () => ({
    config: {
      level: configOption.select({ options: ['low', 'high'], default: 'low' }),
    },
  }),
})

/** A plugin whose `/bump` command counts in its thread state. */
const counter = definePlugin({
  name: 'test/counter',
  setup: (ctx) => {
    const state = ctx.state({ count: 0, label: 'none' })
    return {
      commands: {
        bump: defineCommand({
          description: 'Add one',
          run: async () =>
            (
              await state.update((value) => ({
                ...value,
                count: value.count + 1,
              }))
            ).count,
        }),
      },
    }
  },
})

describe('thread state in the log', () => {
  it('keeps the checked settings, and drops a rejected change', async () => {
    const shared = sharedStores()
    const config = { models: { strong: mockAdapter([]).adapter } }
    const first = await openOn(shared, config)
    await first.session.updateThreadSettings({
      settings: { model: 'strong', instructions: 'Answer in French.' },
    })
    const refused = await first.session.updateThreadSettings({
      settings: { model: 'missing' },
    })
    expect(refused).toMatchObject({ status: 'rejected' })
    await first.host.close()

    const second = await openOn(shared, config)

    expect(second.session.threadSettings()).toEqual({
      model: 'strong',
      instructions: 'Answer in French.',
    })
    expect(shared.written).toEqual([])
    await second.host.close()
  })

  it('keeps the config values', async () => {
    const shared = sharedStores()
    const config = { plugins: () => [level] }
    const first = await openOn(shared, config)
    await first.session.setPluginSetting({ key: 'level', value: 'high' })
    await first.host.close()

    const second = await openOn(shared, config)

    expect(second.session.pluginSettings().level?.value).toBe('high')
    expect(shared.written).toEqual([])
    await second.host.close()
  })

  it('keeps the plugin state, and goes on from it', async () => {
    const shared = sharedStores()
    const config = { plugins: () => [counter] }
    const first = await openOn(shared, config)
    expect(await first.session.runCommand({ name: 'bump' })).toBe(1)
    expect(await first.session.runCommand({ name: 'bump' })).toBe(2)
    await first.host.close()

    const second = await openOn(shared, config)

    expect(second.session.snapshot().plugins).toEqual({
      'test/counter': { count: 2, label: 'none' },
    })
    expect(await second.session.runCommand({ name: 'bump' })).toBe(3)
    expect(shared.written).toEqual([])
    await second.host.close()
  })

  it('keeps the interrupted turn, so a new host resolves it', async () => {
    const shared = sharedStores()
    const execute = vi.fn(async () => ({ removed: true }))
    const remove = toolDefinition({
      name: 'remove',
      description: 'Remove a file',
      needsApproval: true,
      inputSchema: z.object({ path: z.string() }),
    }).server(execute)
    const first = await openOn(shared, { tools: [remove] }, [
      () => toolCall('remove', { path: 'a.txt' }, 'call-1'),
    ])
    const stopped = await first.session.send('Remove a.txt.')
    const [approval] = stopped.interrupts ?? []
    if (!approval) throw new Error('The turn did not stop for approval.')
    await first.host.close()
    const stored = await storedThreadState(shared.persistence.stores.log, {
      threadId: THREAD,
    })
    expect(stored.interrupted?.interrupts.map(({ id }) => id)).toEqual([
      approval.id,
    ])

    const second = await openOn(shared, { tools: [remove] }, [
      () => text('Removed.'),
    ])
    expect(second.session.snapshot()).toMatchObject({
      status: 'requires_action',
      pendingWaits: [{ waitId: approval.id, turn: true }],
    })
    const receipt = await second.session.resolve({
      resume: [{ interruptId: approval.id, status: 'resolved', payload: true }],
    })
    await second.session.operation(receipt.operationId ?? '')

    expect(execute).toHaveBeenCalledOnce()
    expect(turnInterrupts(second.session.snapshot())).toEqual([])
    const after = await storedThreadState(shared.persistence.stores.log, {
      threadId: THREAD,
    })
    expect(after.interrupted).toBeNull()
    expect(shared.written).toEqual([])
    await second.host.close()
  })

  it('runs a turn that a host stopped again with its named overrides', async () => {
    const shared = sharedStores()
    const note: Array<ModelMessage> = [
      { role: 'user', content: 'Today is Friday.' },
    ]
    const stalled = mockAdapter([untilAborted()])
    const first = await openOn(
      shared,
      { models: { strong: stalled.adapter } },
      [],
      CRASHING_OWNERSHIP,
    )
    void first.session
      .send('Plan the week.', {
        inputId: 'in-1',
        overrides: { model: 'strong', reasoning: HIGH },
        systemPreamble: ['You plan weeks.'],
        ephemeral: note,
      })
      .then(
        () => {},
        () => {},
      )
    await waitFor(() => expect(stalled.calls).toHaveLength(1))
    // The first host stops: its ownership of the log expires.
    await ownershipExpired()

    const strong = mockAdapter([() => text('Monday: plan.')])
    const second = await openOn(shared, { models: { strong: strong.adapter } })

    expect(await second.session.settled({ inputId: 'in-1' })).toMatchObject({
      outcome: 'completed',
    })
    // The named model ran it, not the harness adapter.
    expect(second.calls).toHaveLength(0)
    expect(strong.calls).toHaveLength(1)
    const [call] = strong.calls
    expect(call.reasoning).toEqual(HIGH)
    expect(messageTexts(call)).toEqual(['Plan the week.', 'Today is Friday.'])
    expect(JSON.stringify(call.systemPrompts)).toContain('You plan weeks.')
    expect(shared.written).toEqual([])
    await first.host.close().catch(() => {})
    await second.host.close()
  })

  it('keeps the raw result of an agent run', async () => {
    const shared = sharedStores()
    // Longer than a model gets: the compacted copy would omit it.
    const report = { summary: 'x'.repeat(3000), files: 2 }
    const reporter = defineAgent({
      name: 'reporter',
      description: 'Reports',
      run: async () => report,
    })
    const first = await openOn(shared, { agents: [reporter] })
    const reporting = first.session.agent('reporter')
    if (!reporting) throw new Error('The harness has no reporter.')
    const run = reporting.start({})
    expect(await run).toEqual(report)
    await first.host.close()

    const second = await openOn(shared, { agents: [reporter] })

    expect(second.session.agentResult({ runId: run.id })).toEqual(report)
    await expect(second.session.agentRun(run.id)).resolves.toEqual(report)
    expect(second.session.agentResult({ runId: 'op-unknown' })).toBeUndefined()
    expect(shared.written).toEqual([])
    await second.host.close()
  })
})
