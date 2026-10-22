import { describe, expect, it, vi } from 'vitest'
import { defineAgent } from '@tanstack/ai'
import { memoryPersistence } from '@tanstack/ai-persistence'
import { createHarnessHost, defineHarness } from '../src'
import {
  emptyLogState,
  foldEntry,
  loadLogState,
  logIdOf,
  sessionOf,
} from '../src/log'
import { mockAdapter, text, toolCall, wrapLogStore } from './helpers'
import type { LogRecord, LogStore, RunRecord } from '@tanstack/ai-persistence'
import type { LogWriter } from '../src/log'
import type { HarnessPersistence } from '../src'

// Coverage runs in CI are slow, so polled checks wait up to 5 s.
const waitFor = <T>(
  check: () => T | Promise<T>,
  options?: { timeout?: number; interval?: number },
) => vi.waitFor(check, { timeout: 5_000, ...options })

const THREAD = 't'
const LOG = logIdOf({ logId: THREAD })
const alice = { id: 'alice' }

/** The log state that `records` fold to, one entry each. */
function fold(records: ReadonlyArray<LogRecord>) {
  const state = emptyLogState()
  records.forEach((record, index) =>
    foldEntry(state, { seq: index + 1, record }),
  )
  return state
}

/** The run tree of `THREAD` in `store`, folded as a new host folds it. */
async function treeIn(store: LogStore) {
  const state = await loadLogState({ store, logId: LOG, rootThread: THREAD })
  return sessionOf(state, THREAD).thread.tree
}

const agentInput = (inputId: string): LogRecord => ({
  type: 'harness.input',
  inputId,
  input: { op: 'agent', agent: 'helper' },
  at: 1,
})

const node = (runId: string, inputId: string): LogRecord => ({
  type: 'harness.run.node',
  runId,
  kind: 'agent',
  agent: 'helper',
  inputId,
  chainInputId: inputId,
})

const applied = (inputId: string, operationId: string): LogRecord => ({
  type: 'harness.input.applied',
  inputId,
  operationId,
  attempt: 1,
})

const runRecord = (run: Partial<RunRecord> & { runId: string }): LogRecord => ({
  type: 'harness.run',
  run: { threadId: THREAD, status: 'running', startedAt: 1, ...run },
})

const runUpdate = (runId: string, status: RunRecord['status']): LogRecord => ({
  type: 'harness.run.update',
  runId,
  patch: { status },
})

describe('the run tree fold', () => {
  it('keeps a run queued until its input applies, then follows its run record', () => {
    const queued = fold([agentInput('in-1'), node('op-1', 'in-1')])
    expect(queued.thread.tree.get('op-1')?.status).toBe('queued')

    const steps: Array<[LogRecord, string]> = [
      [applied('in-1', 'op-1'), 'running'],
      [runRecord({ runId: 'op-1', kind: 'agent', agent: 'helper' }), 'running'],
      [runUpdate('op-1', 'interrupted'), 'waiting'],
      [runUpdate('op-1', 'running'), 'running'],
      [runUpdate('op-1', 'aborted'), 'cancelled'],
      // A run that ended does not change again.
      [runUpdate('op-1', 'completed'), 'cancelled'],
    ]
    const records = [agentInput('in-1'), node('op-1', 'in-1')]
    for (const [record, status] of steps) {
      records.push(record)
      expect(fold(records).thread.tree.get('op-1')?.status).toBe(status)
    }
  })

  it('makes no node for a run record that core writes inside a run', () => {
    const state = fold([
      agentInput('in-1'),
      node('op-1', 'in-1'),
      applied('in-1', 'op-1'),
      runRecord({
        runId: 'op-1:sub-1',
        threadId: `${THREAD}:helper:in-1`,
        parentRunId: 'op-1',
        subagentRunId: 'sub-1',
      }),
    ])

    expect(state.thread.runs.has('op-1:sub-1')).toBe(true)
    expect([...state.thread.tree.keys()]).toEqual(['op-1'])
  })

  it('names the kind of a run record that has no node', () => {
    const state = fold([
      runRecord({ runId: 'r-chat', kind: 'chat' }),
      runRecord({ runId: 'r-activity', kind: 'activity', status: 'failed' }),
      runRecord({ runId: 'r-compact', kind: 'compact' }),
    ])

    expect(
      [...state.thread.tree.values()].map(({ kind, status }) => ({
        kind,
        status,
      })),
    ).toEqual([
      { kind: 'turn', status: 'running' },
      { kind: 'tool', status: 'failed' },
      { kind: 'command', status: 'running' },
    ])
  })

  it('puts a run that applies the same input again in the place of the run before it', () => {
    const state = fold([
      agentInput('in-1'),
      node('op-1', 'in-1'),
      applied('in-1', 'op-1'),
      node('op-2', 'in-1'),
      applied('in-1', 'op-2'),
    ])

    expect([...state.thread.tree.keys()]).toEqual(['op-2'])
    expect(state.thread.tree.get('op-2')?.status).toBe('running')
  })

  it('ends a run with no run record when its own input settles', () => {
    const command: LogRecord = {
      type: 'harness.run.node',
      runId: 'op-c',
      kind: 'command',
      inputId: 'in-c',
    }
    const state = fold([
      command,
      applied('in-c', 'op-c'),
      // A steer that joined the run settles with it, but does not end it.
      {
        type: 'harness.input.settled',
        inputId: 'in-steer',
        operationId: 'op-c',
        outcome: 'aborted',
      },
    ])
    expect(state.thread.tree.get('op-c')?.status).toBe('running')

    const ended = fold([
      command,
      applied('in-c', 'op-c'),
      {
        type: 'harness.input.settled',
        inputId: 'in-c',
        operationId: 'op-c',
        outcome: 'failed',
        error: { message: 'No such file.' },
      },
    ])
    expect(ended.thread.tree.get('op-c')).toMatchObject({
      status: 'failed',
      error: { message: 'No such file.' },
    })
  })

  it('keeps the result of an agent run', () => {
    const state = fold([
      agentInput('in-1'),
      node('op-1', 'in-1'),
      applied('in-1', 'op-1'),
      {
        type: 'harness.agent.result',
        runId: 'op-1',
        inputId: 'in-1',
        status: 'completed',
        result: { found: 2 },
      },
    ])

    expect(state.thread.tree.get('op-1')).toMatchObject({
      status: 'completed',
      result: { found: 2 },
    })
  })
})

/**
 * A harness whose lead model starts `scout` in the background through its
 * tool. `scout` runs `helper`, and `helper` answers with one model call.
 */
function scouting() {
  const lead = mockAdapter([
    () => toolCall('scout', { prompt: 'Look', background: true }, 'call-1'),
    () => text('Started.'),
    () => text('Got it.'),
  ])
  const child = mockAdapter(() => text('helped'))
  const helper = defineAgent({
    name: 'helper',
    description: 'Helps',
    run: (ctx) => ctx.chat({ adapter: child.adapter }),
  })
  const scout = defineAgent({
    name: 'scout',
    description: 'Scouts',
    run: async (ctx) => await ctx.harness!.agents.run(helper),
  })
  const harness = defineHarness({
    name: 'test/run-tree',
    adapter: lead.adapter,
    subagents: { agents: [scout] },
  })
  return { lead, harness }
}

/** A harness with `lead`, whose code runs `helper`. */
function leading() {
  const helper = defineAgent({
    name: 'helper',
    description: 'Helps',
    run: async () => 'helped',
  })
  const lead = defineAgent({
    name: 'lead',
    description: 'Runs a helper',
    run: async (ctx) => await ctx.harness!.agents.run(helper),
  })
  return defineHarness({
    name: 'test/run-tree',
    adapter: mockAdapter([]).adapter,
    agents: [lead, helper],
  })
}

/** Run `lead` once on a new host, then close it. Returns the lead run id. */
async function runLead(
  persistence: HarnessPersistence,
  options: Parameters<typeof createHarnessHost>[0] = { persistence },
) {
  const host = createHarnessHost(options)
  const session = await host.open(leading(), {
    threadId: THREAD,
    user: alice,
  })
  const run = session.agents.lead.start()
  await run
  const runs = session.agentRuns()
  await host.close()
  return { runId: run.id, runs }
}

describe('the run tree of a session', () => {
  it('folds a turn, the agent its tool started, and that agent child to a tree', async () => {
    const persistence = memoryPersistence()
    const { lead, harness } = scouting()
    const host = createHarnessHost({ persistence })
    const session = await host.open(harness, {
      threadId: THREAD,
      user: alice,
    })

    await session.send('Scout, please')
    await waitFor(() => expect(lead.calls).toHaveLength(3))
    await waitFor(async () => {
      const tree = await treeIn(persistence.stores.log)
      expect(
        [...tree.values()].every((item) => item.status === 'completed'),
      ).toBe(true)
    })

    const state = await loadLogState({
      store: persistence.stores.log,
      logId: LOG,
      rootThread: THREAD,
    })
    const { tree, runs } = sessionOf(state, THREAD).thread
    const nodes = [...tree.values()]
    const [turn, wake] = nodes.filter((item) => item.kind === 'turn')
    const scout = nodes.find((item) => item.agent === 'scout')
    const helper = nodes.find((item) => item.agent === 'helper')
    expect(turn).toMatchObject({ status: 'completed', user: alice })
    expect(turn?.parentRunId).toBeUndefined()
    expect(wake?.parentRunId).toBeUndefined()
    expect(scout).toMatchObject({
      kind: 'agent',
      status: 'completed',
      parentRunId: turn?.runId,
      user: alice,
    })
    expect(helper).toMatchObject({
      kind: 'agent',
      status: 'completed',
      parentRunId: scout?.runId,
      user: alice,
      result: 'helped',
    })
    expect(nodes).toHaveLength(4)
    // The run record keeps only a parent that agent code is: core reads it
    // as a chat run whose child cards it shows.
    expect(runs.get(helper?.runId ?? '')?.parentRunId).toBe(scout?.runId)
    expect(runs.get(scout?.runId ?? '')?.parentRunId).toBeUndefined()
    // The chat run of `helper` inside its run has a record, and no node.
    const inner = [...runs.keys()].filter((id) =>
      id.startsWith(`${helper?.runId}:`),
    )
    expect(inner).not.toHaveLength(0)
    await host.close()
  })

  it('keeps the tree in a snapshot: a fold from the snapshot is the fold from the start', async () => {
    const persistence = memoryPersistence()
    const { log } = persistence.stores
    const { runId } = await runLead(persistence, {
      persistence,
      log: { saveSnapshotAfter: { bytes: 1 } },
    })
    const head = (await log.read({ logId: LOG })).at(-1)?.seq
    await waitFor(async () =>
      expect((await log.getSnapshot({ logId: LOG }))?.seq).toBe(head),
    )
    const fromStart = wrapLogStore(log, {
      getSnapshot: () => Promise.resolve(null),
    })

    const fromSnapshot = await loadLogState({
      store: log,
      logId: LOG,
      rootThread: THREAD,
    })

    expect(fromSnapshot.snapshotSeq).toBe(head)
    const tree = sessionOf(fromSnapshot, THREAD).thread.tree
    expect(tree.get(runId)).toMatchObject({
      agent: 'lead',
      status: 'completed',
    })
    expect([...tree]).toEqual([...(await treeIn(fromStart))])
  })

  it('lists the same agent runs on a second host, from the tree, with no scan of the inputs', async () => {
    const persistence = memoryPersistence()
    const { runs } = await runLead(persistence)
    const host = createHarnessHost({ persistence })
    const session = await host.open(leading(), {
      threadId: THREAD,
      user: alice,
    })
    const { inputs } = (session as unknown as { writer: LogWriter }).writer
      .state
    const scans = [
      vi.spyOn(inputs, 'values'),
      vi.spyOn(inputs, 'entries'),
      vi.spyOn(inputs, 'forEach'),
      vi.spyOn(inputs, Symbol.iterator),
    ]

    const listed = session.agentRuns()

    expect(listed).toEqual(runs)
    expect(listed.map((run) => run.agent)).toEqual(['lead', 'helper'])
    for (const scan of scans) expect(scan).not.toHaveBeenCalled()
    await host.close()
  })
})
