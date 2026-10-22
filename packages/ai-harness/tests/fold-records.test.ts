import { describe, expect, it } from 'vitest'
import {
  KEPT_ENDED,
  THREAD_RECORD_TYPES,
  emptyThreadState,
  foldThreadRecord,
  pluginStateDeltas,
} from '../src/log-records'
import { emptyLogState, foldEntry } from '../src/log'
import type { LogRecord } from '@tanstack/ai-persistence'
import type { ThreadRecord } from '../src/log-records'

function fold(records: ReadonlyArray<ThreadRecord | LogRecord>) {
  let state = emptyThreadState()
  for (const record of records) state = foldThreadRecord(state, record)
  return state
}

const prompt = { op: 'prompt', message: 'Check the build.' } as const

describe('foldThreadRecord', () => {
  it('keeps the newest full settings', () => {
    const state = fold([
      { type: 'harness.settings', settings: { model: 'cheap', cwd: 'src' } },
      {
        type: 'harness.settings',
        settings: { instructions: 'Be short.' },
        inputId: 'in-1',
        user: { id: 'u-1' },
      },
    ])
    expect(state.settings).toEqual({ instructions: 'Be short.' })
  })

  it('sets a config value and unsets it with null', () => {
    const state = fold([
      { type: 'harness.config', key: 'tone', value: 'formal' },
      { type: 'harness.config', key: 'depth', value: { level: 2 } },
      { type: 'harness.config', key: 'tone', value: null },
    ])
    expect([...state.config]).toEqual([['depth', { level: 2 }]])
  })

  it('merges plugin state deltas at their path', () => {
    const state = fold([
      {
        type: 'harness.plugin.state',
        plugin: 'todos',
        delta: { path: [], value: { items: ['a'], meta: { count: 1 } } },
      },
      {
        type: 'harness.plugin.state',
        plugin: 'todos',
        delta: { path: ['meta', 'count'], value: 2 },
      },
      {
        type: 'harness.plugin.state',
        plugin: 'todos',
        delta: { path: ['filter', 'done'], value: true },
      },
      {
        type: 'harness.plugin.state',
        plugin: 'goal',
        delta: { path: [], value: 'ship it' },
      },
    ])
    expect(state.plugins.get('todos')).toEqual({
      items: ['a'],
      meta: { count: 2 },
      filter: { done: true },
    })
    expect(state.plugins.get('goal')).toBe('ship it')
  })

  it('replaces a value that is not an object when a delta sets a field in it', () => {
    const state = fold([
      {
        type: 'harness.plugin.state',
        plugin: 'todos',
        delta: { path: [], value: ['a', 'b'] },
      },
      {
        type: 'harness.plugin.state',
        plugin: 'todos',
        delta: { path: ['count'], value: 1 },
      },
    ])
    expect(state.plugins.get('todos')).toEqual({ count: 1 })
  })

  it('sets the interrupted turn and clears it with null', () => {
    const turn = {
      runId: 'run-1',
      interrupts: [],
      user: { id: 'u-1', tenantId: 'org-1' },
      context: { page: 'home' },
    }
    const stopped = fold([{ type: 'harness.interrupted', turn }])
    expect(stopped.interrupted).toEqual(turn)
    const cleared = fold([
      { type: 'harness.interrupted', turn },
      { type: 'harness.interrupted', turn: null },
    ])
    expect(cleared.interrupted).toBeNull()
  })

  it('keeps each agent result by run id', () => {
    const state = fold([
      {
        type: 'harness.agent.result',
        runId: 'run-1',
        inputId: 'in-1',
        status: 'completed',
        result: { summary: 'done' },
      },
      {
        type: 'harness.agent.result',
        runId: 'run-2',
        inputId: 'in-2',
        status: 'failed',
        error: { message: 'The host stopped.', code: 'timeout' },
      },
    ])
    expect([...state.agentResults]).toEqual([
      [
        'run-1',
        { inputId: 'in-1', status: 'completed', result: { summary: 'done' } },
      ],
      [
        'run-2',
        {
          inputId: 'in-2',
          status: 'failed',
          error: { message: 'The host stopped.', code: 'timeout' },
        },
      ],
    ])
  })

  it('keeps the turn overrides by input id', () => {
    const state = fold([
      {
        type: 'harness.input.turn',
        inputId: 'in-1',
        overrides: {
          model: 'cheap',
          modelOptions: { temperature: 0 },
          systemPreamble: ['You review code.'],
          ephemeral: [{ role: 'user', content: 'Today is Friday.' }],
        },
      },
    ])
    expect(state.turnOverrides.get('in-1')).toEqual({
      model: 'cheap',
      modelOptions: { temperature: 0 },
      systemPreamble: ['You review code.'],
      ephemeral: [{ role: 'user', content: 'Today is Friday.' }],
    })
  })

  it('keeps a schedule until its done record', () => {
    const state = fold([
      { type: 'harness.schedule', scheduleId: 's-1', at: 1000, input: prompt },
      { type: 'harness.schedule', scheduleId: 's-2', at: 2000, input: prompt },
      { type: 'harness.schedule.done', scheduleId: 's-1' },
    ])
    expect([...state.schedules]).toEqual([['s-2', { at: 2000, input: prompt }]])
  })

  it('returns the same state for a record type it does not fold', () => {
    const state = emptyThreadState()
    const unknownRecords: Array<LogRecord> = [
      { type: 'harness.note', noteId: 'n-1', note: 'Hi.' },
      { type: 'harness.from-the-future', value: 1 },
      { type: 'app.custom', value: 2 },
    ]
    for (const record of unknownRecords) {
      expect(foldThreadRecord(state, record)).toBe(state)
    }
  })

  it('changes the maps in place, but never an entry that a caller holds', () => {
    const run = {
      runId: 'r-1',
      threadId: 't-1',
      status: 'running',
      startedAt: 1,
    } as const
    const state = fold([{ type: 'harness.run', run }])
    const { runs } = state
    const held = runs.get('r-1')
    const next = foldThreadRecord(state, {
      type: 'harness.run.update',
      runId: 'r-1',
      patch: { status: 'completed' },
    })

    expect(next.runs).toBe(runs)
    expect(runs.get('r-1')?.status).toBe('completed')
    expect(held?.status).toBe('running')
  })

  it('folds the same records to equal states', () => {
    const records: Array<ThreadRecord> = [
      { type: 'harness.settings', settings: { model: 'cheap' } },
      { type: 'harness.config', key: 'tone', value: 'formal' },
      {
        type: 'harness.plugin.state',
        plugin: 'todos',
        delta: { path: ['count'], value: 3 },
      },
      { type: 'harness.schedule', scheduleId: 's-1', at: 1000, input: prompt },
    ]
    expect(fold(records)).toEqual(fold(records))
  })

  it('lists every record type it folds', () => {
    expect(THREAD_RECORD_TYPES).toEqual([
      'harness.settings',
      'harness.config',
      'harness.plugin.state',
      'harness.interrupted',
      'harness.agent.result',
      'harness.input.turn',
      'harness.schedule',
      'harness.schedule.done',
      'harness.run',
      'harness.run.update',
      'harness.run.node',
      'harness.interrupt',
      'harness.interrupt.end',
      'harness.wait',
      'harness.wait.settled',
      'harness.transferred',
      'harness.handoff',
      'harness.state',
      'harness.workspace.bound',
    ])
  })

  it('keeps the last workspace binding', () => {
    const bound = (root: string) =>
      ({
        type: 'harness.workspace.bound',
        binding: { kind: 'host', root },
      }) as const
    expect(emptyThreadState().workspace).toBeNull()
    expect(fold([bound('/a'), bound('/b')]).workspace).toEqual({
      kind: 'host',
      root: '/b',
    })
  })

  it('keeps the target of the last handoff as the active agent', () => {
    const handoff = (from: string | null, to: string | null) =>
      ({ type: 'harness.handoff', from, to, runId: 'r', by: 'router' }) as const
    expect(emptyThreadState().activeAgent).toBeNull()
    expect(fold([handoff(null, 'billing')]).activeAgent).toBe('billing')
    expect(
      fold([handoff(null, 'billing'), handoff('billing', null)]).activeAgent,
    ).toBeNull()
  })

  it('ends a handoff to a person when its human wait settles in any way', () => {
    const wait = { waitId: 'w1', kind: 'human' as const, runId: 'r' }
    const paused = [
      { type: 'harness.wait', wait, at: 1 },
      {
        type: 'harness.handoff',
        from: 'billing',
        to: { human: true },
        runId: 'r',
        by: 'tool',
        waitId: 'w1',
      },
    ] as const
    for (const outcome of ['answered', 'cancelled', 'expired'] as const) {
      const state = fold([
        ...paused,
        { type: 'harness.wait.settled', waitId: 'w1', outcome, at: 2 },
      ])
      expect(state.activeAgent).toBe('billing')
    }
  })

  it('refuses a handoff to a person with no waitId', () => {
    expect(() =>
      fold([
        {
          type: 'harness.handoff',
          from: null,
          to: { human: true },
          runId: 'r',
          by: 'tool',
        },
      ]),
    ).toThrow('has no waitId')
  })

  it('keeps each transfer by id, and its first record', () => {
    const state = fold([
      {
        type: 'harness.transferred',
        transferId: 'tr-1',
        to: { harness: 'billing', threadId: 't2' },
        at: 1,
      },
      // A retry that wrote the same transfer again keeps the first record.
      {
        type: 'harness.transferred',
        transferId: 'tr-1',
        to: { harness: 'billing', threadId: 't2' },
        at: 2,
      },
      {
        type: 'harness.transferred',
        transferId: 'tr-2',
        from: { harness: 'support', threadId: 't0' },
        user: { id: 'olga' },
        at: 3,
      },
    ])
    expect([...state.transfers]).toEqual([
      ['tr-1', { to: { harness: 'billing', threadId: 't2' }, at: 1 }],
      [
        'tr-2',
        {
          from: { harness: 'support', threadId: 't0' },
          user: { id: 'olga' },
          at: 3,
        },
      ],
    ])
  })

  it('keeps each wait by id, and its first end', () => {
    const wait = { waitId: 'w1', kind: 'human' as const, runId: 'run-1' }
    const state = fold([
      { type: 'harness.wait', wait, at: 1 },
      // A second open of the same id keeps the first record.
      { type: 'harness.wait', wait: { ...wait, message: 'again' }, at: 2 },
      { type: 'harness.wait', wait: { ...wait, waitId: 'w2' }, at: 3 },
      {
        type: 'harness.wait.settled',
        waitId: 'w1',
        outcome: 'answered',
        at: 4,
        value: { resume: true },
      },
      // A wait ends once: a later end changes nothing.
      { type: 'harness.wait.settled', waitId: 'w1', outcome: 'expired', at: 5 },
      {
        type: 'harness.wait.settled',
        waitId: 'nope',
        outcome: 'expired',
        at: 6,
      },
    ])
    expect([...state.waits]).toEqual([
      [
        'w1',
        {
          wait,
          at: 1,
          outcome: 'answered',
          settledAt: 4,
          value: { resume: true },
        },
      ],
      ['w2', { wait: { ...wait, waitId: 'w2' }, at: 3 }],
    ])
  })
})

describe('pluginStateDeltas', () => {
  /** The state that `deltas` fold to on top of `current`. */
  function applied(current: unknown, next: unknown) {
    const records: Array<ThreadRecord> = [
      {
        type: 'harness.plugin.state',
        plugin: 'p',
        delta: { path: [], value: current },
      },
      ...pluginStateDeltas(current, next).map(
        (delta): ThreadRecord => ({
          type: 'harness.plugin.state',
          plugin: 'p',
          delta,
        }),
      ),
    ]
    return fold(records).plugins.get('p')
  }

  it('writes one delta for each changed field', () => {
    const current = { count: 1, label: 'a', meta: { seen: true } }
    const next = { count: 2, label: 'a', meta: { seen: true }, extra: 'x' }
    expect(pluginStateDeltas(current, next)).toEqual([
      { path: ['count'], value: 2 },
      { path: ['extra'], value: 'x' },
    ])
    expect(applied(current, next)).toEqual(next)
  })

  it('sets the whole value when a field is gone, or for a value that is not an object', () => {
    const removed = { count: 1 }
    expect(pluginStateDeltas({ count: 1, label: 'a' }, removed)).toEqual([
      { path: [], value: removed },
    ])
    expect(applied({ count: 1, label: 'a' }, removed)).toEqual(removed)
    expect(pluginStateDeltas(['a'], ['a', 'b'])).toEqual([
      { path: [], value: ['a', 'b'] },
    ])
    expect(pluginStateDeltas(undefined, { count: 0 })).toEqual([
      { path: [], value: { count: 0 } },
    ])
  })

  it('writes nothing for the same value', () => {
    expect(pluginStateDeltas({ count: 1 }, { count: 1 })).toEqual([])
  })
})

describe('the fold of a long thread', () => {
  /** The records of `turns` turns: each one an agent run with an interrupt. */
  function foldTurns(turns: number) {
    const state = emptyLogState()
    let seq = 0
    const add = (record: LogRecord) => foldEntry(state, { seq: ++seq, record })
    // A run that started first and still runs stays in the fold.
    add({
      type: 'harness.run',
      run: { runId: 'live', threadId: 't', status: 'running', startedAt: 0 },
    })
    for (let turn = 0; turn < turns; turn++) {
      const inputId = `in-${turn}`
      const runId = `run-${turn}`
      add({ type: 'harness.input', inputId, input: prompt, at: turn })
      add({
        type: 'harness.input.turn',
        inputId,
        overrides: { ephemeral: [{ role: 'user', content: 'Be short.' }] },
      })
      add({
        type: 'harness.input.applied',
        inputId,
        operationId: runId,
        attempt: 1,
      })
      add({
        type: 'harness.run',
        run: {
          runId,
          threadId: 't',
          status: 'running',
          startedAt: turn,
          kind: 'agent',
        },
      })
      add({
        type: 'harness.interrupt',
        interrupt: {
          interruptId: `i-${turn}`,
          runId,
          threadId: 't',
          requestedAt: turn,
          payload: {},
        },
      })
      add({
        type: 'harness.interrupt.end',
        interruptId: `i-${turn}`,
        status: 'resolved',
        at: turn,
        response: { ok: true },
      })
      add({
        type: 'harness.agent.result',
        runId,
        inputId,
        status: 'completed',
        result: { text: 'Done.' },
      })
      add({
        type: 'harness.run.update',
        runId,
        patch: { status: 'completed' },
      })
      add({
        type: 'harness.input.settled',
        inputId,
        operationId: runId,
        outcome: 'completed',
      })
    }
    return state.thread
  }

  it('drops the overrides of settled turns, and keeps a tail of ended runs', () => {
    const thread = foldTurns(KEPT_ENDED + 50)

    expect(thread.turnOverrides.size).toBe(0)
    expect(thread.runs.size).toBe(KEPT_ENDED + 1)
    expect(thread.runs.get('live')?.status).toBe('running')
    expect(thread.runs.has('run-49')).toBe(false)
    expect(thread.runs.has('run-50')).toBe(true)
    expect(thread.tree.size).toBe(KEPT_ENDED)
    expect(thread.interrupts.size).toBe(KEPT_ENDED)
    expect(thread.agentResults.size).toBe(KEPT_ENDED)
  })

  it('keeps the snapshot of the thread state the same size as turns go on', () => {
    const sizeAfter = (turns: number) =>
      JSON.stringify(
        Object.values(foldTurns(turns)).map((value) =>
          value instanceof Map ? [...value] : value,
        ),
      ).length
    // Only the digits of the ids grow.
    expect(sizeAfter(4 * KEPT_ENDED)).toBeLessThan(
      sizeAfter(2 * KEPT_ENDED) * 1.1,
    )
  })
})
