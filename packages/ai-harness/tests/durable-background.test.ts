import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { defineAgent, toolDefinition } from '@tanstack/ai'
import { memoryLogStore, memoryPersistence } from '@tanstack/ai-persistence'
import { createHarnessHost, defineHarness, definePlugin } from '../src'
import {
  CRASHING_OWNERSHIP,
  gate,
  mockAdapter,
  ownershipExpired,
  storedThreadState,
  text,
  toolCall,
  untilAborted,
} from './helpers'
import type { AnyTextAdapter } from '@tanstack/ai'
import type { HarnessPlugin, HarnessSession, PluginSessionApi } from '../src'

// Coverage runs in CI are slow, so polled checks wait up to 5 s.
const waitFor = <T>(
  check: () => T | Promise<T>,
  options?: { timeout?: number; interval?: number },
) => vi.waitFor(check, { timeout: 5_000, ...options })

const THREAD = 't'

function durablePersistence() {
  const { metadata } = memoryPersistence().stores
  return { stores: { log: memoryLogStore(), metadata } }
}

type Durable = ReturnType<typeof durablePersistence>

/** A promise that resolves when `signal` aborts. */
const untilAbort = (signal: AbortSignal | undefined) =>
  new Promise<void>((resolve) => {
    if (!signal || signal.aborted) return resolve()
    signal.addEventListener('abort', () => resolve(), { once: true })
  })

/** The text of each assistant message in the transcript. */
async function assistantTexts(session: HarnessSession) {
  const messages = await session.transcript()
  return messages
    .filter((message) => message.role === 'assistant')
    .map((message) => message.content)
    .filter((content) => typeof content === 'string')
}

/** Open the thread on a new host that shares `persistence`. */
function openOn(
  persistence: Durable,
  adapter: AnyTextAdapter,
  plugins: Array<HarnessPlugin> = [],
) {
  return createHarnessHost({ persistence }).open(
    defineHarness({
      name: 'test/durable-background',
      adapter,
      plugins: () => plugins,
    }),
    {
      threadId: THREAD,
    },
  )
}

describe('background work after a crash', () => {
  it('notes a moved tool call that the crash stopped', async () => {
    const persistence = durablePersistence()
    const started = gate()
    const wait = toolDefinition({
      name: 'wait',
      description: 'Waits',
      inputSchema: { type: 'object', properties: {} },
    }).server((_args: unknown, context) => {
      started.open()
      const work = new Promise<string>(() => {})
      const detach = context?.detach
      return detach ? Promise.race([work, detach(work)]) : work
    })
    const first = mockAdapter([
      () => toolCall('wait', {}, 'call-1'),
      () => text('Moved.'),
    ])
    const crashed = await createHarnessHost({
      persistence,
      ownership: CRASHING_OWNERSHIP,
    }).open(
      defineHarness({
        name: 'test/durable-background',
        adapter: first.adapter,
        tools: [wait],
      }),
      {
        threadId: THREAD,
      },
    )
    const turn = crashed.send('Wait')
    await started.opened
    expect(
      await crashed.moveToolCallToBackground({ toolCallId: 'call-1' }),
    ).toMatchObject({
      status: 'accepted',
    })
    await turn

    // The first host never closes, like a process that stopped. Its
    // ownership of the log expires.
    await ownershipExpired()
    const next = mockAdapter([])
    const recovered = await openOn(persistence, next.adapter)

    expect(await assistantTexts(recovered)).toEqual([
      'Moved.',
      'Background job call-1 stopped when the host restarted.',
    ])
    await recovered.recoverPendingWork()
    expect(await assistantTexts(recovered)).toHaveLength(2)
  })

  /**
   * Start `scout` with `background: true` from the model of a host that
   * stops. Its first attempt waits until it is aborted.
   */
  async function startScout(
    persistence: Durable,
    durability?: { resumeBackgroundAgents: boolean },
  ) {
    let attempt = 0
    const scout = defineAgent({
      name: 'scout',
      description: 'Scouts',
      run: async (ctx) => {
        attempt += 1
        if (attempt === 1) await untilAbort(ctx.abortSignal)
        return 'scouted'
      },
    })
    const harness = (adapter: AnyTextAdapter) =>
      defineHarness({
        name: 'test/durable-background',
        adapter,
        subagents: { agents: [scout] },
        ...(durability ? { durability } : {}),
      })
    const lead = mockAdapter([
      () => toolCall('scout', { prompt: 'Look', background: true }, 'call-1'),
      () => text('Started.'),
    ])
    const crashed = await createHarnessHost({
      persistence,
      ownership: CRASHING_OWNERSHIP,
    }).open(harness(lead.adapter), { threadId: THREAD })
    await crashed.send('Scout')
    await waitFor(() => expect(crashed.agentRuns()[0]?.status).toBe('running'))
    await ownershipExpired()
    return { harness, attempts: () => attempt }
  }

  /** The agent runs of `THREAD` in the log, oldest first. */
  async function agentRunRecords(persistence: Durable) {
    const state = await storedThreadState(persistence.stores.log, {
      threadId: THREAD,
    })
    return [...state.runs.values()]
      .filter((run) => run.kind === 'agent')
      .sort((a, b) => a.startedAt - b.startedAt)
  }

  it('continues a background agent of the model on the next host, with the same subagentRunId', async () => {
    const persistence = durablePersistence()
    const { harness, attempts } = await startScout(persistence)

    const host = createHarnessHost({ persistence })
    const next = mockAdapter(() => text('Noted.'))
    const recovered = await host.open(harness(next.adapter), {
      threadId: THREAD,
    })

    await waitFor(() =>
      expect(recovered.agentRuns().map((run) => run.status)).toContain(
        'completed',
      ),
    )
    expect(attempts()).toBe(2)
    const [stopped, resumed] = await agentRunRecords(persistence)
    expect(stopped?.status).toBe('failed')
    expect(resumed?.status).toBe('completed')
    expect(resumed?.subagentRunId).toBe(stopped?.subagentRunId)
    await host.close()
  })

  it('fails a background agent of the model on the next host with resumeBackgroundAgents false', async () => {
    const persistence = durablePersistence()
    const { harness, attempts } = await startScout(persistence, {
      resumeBackgroundAgents: false,
    })

    const host = createHarnessHost({ persistence })
    const next = mockAdapter(() => text('Noted.'))
    const recovered = await host.open(harness(next.adapter), {
      threadId: THREAD,
    })

    await waitFor(() =>
      expect(recovered.agentRuns().map((run) => run.status)).toEqual([
        'failed',
      ]),
    )
    expect(attempts()).toBe(1)
    await host.close()
  })

  /**
   * Start `scout` with `background: true` from the model of a host that
   * stops after the start of the child is in the log, and before the child
   * runs: the host checks the child input last, and that check never ends.
   * Returns the `subagentRunId` that the model got.
   */
  async function startScoutThatNeverRan(
    persistence: Durable,
    durability?: { resumeBackgroundAgents: boolean },
  ) {
    let checks = 0
    let runs = 0
    const scout = defineAgent({
      name: 'scout',
      description: 'Scouts',
      // The tool call checks the input first. The host checks it again just
      // before the child runs: there the first host stops. Zod calls this
      // twice in each check: a sync pass, then an async pass.
      inputSchema: z.object({ topic: z.string() }).refine(async () => {
        checks += 1
        if (checks === 4) await new Promise(() => {})
        return true
      }),
      run: async () => {
        runs += 1
        return 'scouted'
      },
    })
    const harness = (adapter: AnyTextAdapter) =>
      defineHarness({
        name: 'test/durable-background',
        adapter,
        subagents: { agents: [scout] },
        ...(durability ? { durability } : {}),
      })
    const lead = mockAdapter([
      () => toolCall('scout', { topic: 'Look', background: true }, 'call-1'),
      () => text('Started.'),
    ])
    const crashed = await createHarnessHost({
      persistence,
      ownership: CRASHING_OWNERSHIP,
    }).open(harness(lead.adapter), { threadId: THREAD })
    await crashed.send('Scout')
    await waitFor(() => expect(checks).toBe(4))
    const result = (await crashed.transcript()).find(
      (message) => message.role === 'tool',
    )
    const { subagentRunId } = JSON.parse(String(result?.content))
    await ownershipExpired()
    return { harness, subagentRunId, runs: () => runs }
  }

  it('starts a background agent of the model that never ran on the next host, as the same child', async () => {
    const persistence = durablePersistence()
    const { harness, subagentRunId, runs } =
      await startScoutThatNeverRan(persistence)

    const host = createHarnessHost({ persistence })
    const next = mockAdapter(() => text('Noted.'))
    const recovered = await host.open(harness(next.adapter), {
      threadId: THREAD,
    })

    await waitFor(() =>
      expect(recovered.agentRuns().map((run) => run.status)).toEqual([
        'completed',
      ]),
    )
    expect(runs()).toBe(1)
    const [run] = recovered.agentRuns()
    expect(run?.subagentRunId).toBe(subagentRunId)
    const [record] = await agentRunRecords(persistence)
    expect(record?.subagentRunId).toBe(subagentRunId)
    // The run tree keeps the turn that started it as its parent.
    const { tree } = await storedThreadState(persistence.stores.log, {
      threadId: THREAD,
    })
    const turn = [...tree.values()].find((node) => node.kind === 'turn')
    expect(run?.parentRunId).toBe(turn?.runId)
    await host.close()
  })

  it('starts a background agent of the model that never ran on the next host, also with resumeBackgroundAgents false', async () => {
    const persistence = durablePersistence()
    const { harness, runs } = await startScoutThatNeverRan(persistence, {
      resumeBackgroundAgents: false,
    })

    const host = createHarnessHost({ persistence })
    const next = mockAdapter(() => text('Noted.'))
    const recovered = await host.open(harness(next.adapter), {
      threadId: THREAD,
    })

    await waitFor(() =>
      expect(recovered.agentRuns().map((run) => run.status)).toEqual([
        'completed',
      ]),
    )
    expect(runs()).toBe(1)
    await host.close()
  })

  it('adds a note that waited for a busy turn once', async () => {
    const persistence = durablePersistence()
    let api: PluginSessionApi | undefined
    const noter = definePlugin({
      name: 'test/noter',
      setup: (ctx) => {
        api = ctx.session
      },
    })
    const noted = gate()
    const remind = toolDefinition({
      name: 'remind',
      description: 'Adds a note',
      inputSchema: { type: 'object', properties: {} },
    }).server(async () => {
      await api?.note('Remember the milk.')
      noted.open()
      return 'ok'
    })
    const first = mockAdapter([
      () => toolCall('remind', {}, 'call-1'),
      untilAborted(),
    ])
    const crashed = await createHarnessHost({
      persistence,
      ownership: CRASHING_OWNERSHIP,
    }).open(
      defineHarness({
        name: 'test/durable-background',
        adapter: first.adapter,
        tools: [remind],
        plugins: () => [noter],
      }),
      {
        threadId: THREAD,
      },
    )
    void Promise.resolve(crashed.send('Remind me')).catch(() => {})
    await noted.opened
    await waitFor(() => expect(first.calls).toHaveLength(2))
    await ownershipExpired()

    const next = mockAdapter([() => text('Done.')])
    const recovered = await createHarnessHost({ persistence }).open(
      defineHarness({
        name: 'test/durable-background',
        adapter: next.adapter,
        tools: [remind],
        plugins: () => [noter],
      }),
      {
        threadId: THREAD,
      },
    )
    await waitFor(async () =>
      expect(await assistantTexts(recovered)).toContain('Remember the milk.'),
    )
    await recovered.recoverPendingWork()
    const texts = await assistantTexts(recovered)
    expect(texts.filter((each) => each === 'Remember the milk.')).toEqual([
      'Remember the milk.',
    ])
  })
})
