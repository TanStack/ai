import { afterEach, describe, expect, it, vi } from 'vitest'
import { toolDefinition } from '@tanstack/ai'
import { memoryLogState, memoryLogStore } from '@tanstack/ai-persistence'
import {
  createHarnessHost,
  createHarnessWorker,
  defineHarness,
  durableTool,
  logIdOf,
} from '../src'
import {
  after,
  canOtherHostTake,
  gate,
  mockAdapter,
  text,
  toolCall,
  untilAborted,
  wrapLogStore,
} from './helpers'
import type { AnyTextAdapter, Logger } from '@tanstack/ai'
import type { LogRecord, LogStore } from '@tanstack/ai-persistence'
import type { AnyHarness, HarnessHost } from '../src'

// Coverage runs in CI are slow, so polled checks wait up to 5 s.
const waitFor = <T>(
  check: () => T | Promise<T>,
  options?: { timeout?: number; interval?: number },
) => vi.waitFor(check, { timeout: 5_000, ...options })

const NAME = 'test/harness-worker'
const THREAD = 't1'
/** The id of the log of `THREAD` in the store. */
const LOG = logIdOf({ logId: THREAD })
const MINUTE = 60_000

const harnessWith = (
  adapter: AnyTextAdapter,
  tools: AnyHarness['tools'] = [],
) => defineHarness({ name: NAME, adapter, tools })

/** Two log stores on one backend: two servers on one database. */
function twoStores() {
  const logState = memoryLogState()
  return {
    a: memoryLogStore({ state: logState }),
    b: memoryLogStore({ state: logState }),
  }
}

const hostOn = (log: LogStore) =>
  createHarnessHost({ persistence: { stores: { log } } })

/** The records of the log of `threadId`. */
const recordsOf = async (log: LogStore, threadId = THREAD) =>
  (await log.read({ logId: logIdOf({ logId: threadId }) })).map(
    (entry) => entry.record,
  )

/** The settle record of `inputId` in the log of `threadId`, or undefined. */
const settledRecord = async (
  log: LogStore,
  inputId: string,
  threadId = THREAD,
) =>
  (await recordsOf(log, threadId)).find(
    (record) =>
      record.type === 'harness.input.settled' && record.inputId === inputId,
  )

/** How many records of `type` with `inputId` the log of `THREAD` has. */
const countOf = async (log: LogStore, type: string, inputId: string) =>
  (await recordsOf(log)).filter(
    (record: LogRecord) => record.type === type && record.inputId === inputId,
  ).length

/** Offer a prompt to `threadId` from `host`, as a server that runs nothing. */
const submitPrompt = (
  host: HarnessHost,
  harness: AnyHarness,
  threadId: string,
  inputId: string,
) =>
  host.submit({
    harness,
    threadId,
    input: { op: 'prompt', message: 'Go.' },
    inputId,
  })

/** Wait a little real time, so work that must not happen has its chance. */
const pause = () => new Promise((resolve) => setTimeout(resolve, 50))

/** Move the clock of the harness and of the memory log store. */
const moveClock = (ms: number) => vi.setSystemTime(Date.now() + ms)

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('createHarnessWorker', () => {
  it('runs an input that another host submitted, then releases the thread', async () => {
    const { a, b } = twoStores()
    const { adapter, calls } = mockAdapter([() => text('Done.')])
    const harness = harnessWith(adapter)
    const submitter = hostOn(a)
    const runner = hostOn(b)

    expect(await submitPrompt(submitter, harness, THREAD, 'in-1')).toEqual({
      inputId: 'in-1',
      status: 'queued',
    })
    const worker = createHarnessWorker({
      host: runner,
      harnesses: [harness],
      pollMs: 10,
    })

    await waitFor(async () =>
      expect(await settledRecord(a, 'in-1')).toMatchObject({
        outcome: 'completed',
      }),
    )
    await worker.stop()
    expect(calls).toHaveLength(1)
    expect(runner.isOpen(harness, { threadId: THREAD })).toBe(false)
    expect(await canOtherHostTake(a, LOG)).toBe(true)
    await submitter.close()
    await runner.close()
  })

  it('runs at most concurrency threads at the same time', async () => {
    const log = memoryLogStore()
    const release = gate()
    const { adapter, calls } = mockAdapter(after(release.opened, 'Done.'))
    const harness = harnessWith(adapter)
    const host = hostOn(log)
    const threads = ['t-a', 't-b', 't-c']
    for (const threadId of threads) {
      await submitPrompt(host, harness, threadId, `in-${threadId}`)
    }

    const worker = createHarnessWorker({
      host,
      harnesses: [harness],
      concurrency: 2,
      pollMs: 10,
    })
    await waitFor(() => expect(calls).toHaveLength(2))
    await pause()
    expect(calls).toHaveLength(2)

    release.open()
    for (const threadId of threads) {
      await waitFor(async () =>
        expect(
          await settledRecord(log, `in-${threadId}`, threadId),
        ).toMatchObject({ outcome: 'completed' }),
      )
    }
    expect(calls).toHaveLength(3)
    await worker.stop()
    await host.close()
  })

  it('stop() waits for the running thread to end, then releases its log', async () => {
    const log = memoryLogStore()
    const release = gate()
    const { adapter, calls } = mockAdapter(after(release.opened, 'Done.'))
    const harness = harnessWith(adapter)
    const host = hostOn(log)
    await submitPrompt(host, harness, THREAD, 'in-1')
    const worker = createHarnessWorker({
      host,
      harnesses: [harness],
      pollMs: 10,
    })
    await waitFor(() => expect(calls).toHaveLength(1))

    let isStopped = false
    const stopping = worker.stop().then(() => {
      isStopped = true
    })
    await pause()
    expect(isStopped).toBe(false)
    expect(await canOtherHostTake(log, LOG)).toBe(false)

    release.open()
    await stopping
    expect(await settledRecord(log, 'in-1')).toMatchObject({
      outcome: 'completed',
    })
    expect(host.isOpen(harness, { threadId: THREAD })).toBe(false)
    expect(await canOtherHostTake(log, LOG)).toBe(true)
    await host.close()
  })

  it('waits longer after each look that finds no work, up to 30 s', async () => {
    vi.useFakeTimers()
    // No random part: each wait is the full backoff.
    vi.spyOn(Math, 'random').mockReturnValue(1)
    const inner = memoryLogStore()
    const looks = vi.fn()
    const log = wrapLogStore(inner, {
      listLogsWithoutOwner: (query) => {
        looks()
        return inner.listLogsWithoutOwner(query)
      },
    })
    const host = hostOn(log)
    const harness = harnessWith(mockAdapter([]).adapter)

    const worker = createHarnessWorker({
      host,
      harnesses: [harness],
      pollMs: 10_000,
    })
    // The waits: 10 s, 20 s, then 30 s each time.
    const steps = [
      { ms: 0, looks: 1 },
      { ms: 9_999, looks: 1 },
      { ms: 1, looks: 2 },
      { ms: 20_000, looks: 3 },
      { ms: 30_000, looks: 4 },
      { ms: 30_000, looks: 5 },
    ]
    for (const step of steps) {
      await vi.advanceTimersByTimeAsync(step.ms)
      expect(looks).toHaveBeenCalledTimes(step.looks)
    }

    await worker.stop()
    await host.close()
  })

  it('stops when its signal aborts', async () => {
    const log = memoryLogStore()
    const looks = vi.fn()
    const host = hostOn(
      wrapLogStore(log, {
        listLogsWithoutOwner: (query) => {
          looks()
          return log.listLogsWithoutOwner(query)
        },
      }),
    )
    const controller = new AbortController()
    const worker = createHarnessWorker({
      host,
      harnesses: [harnessWith(mockAdapter([]).adapter)],
      signal: controller.signal,
      pollMs: 5,
    })
    await waitFor(() => expect(looks).toHaveBeenCalled())

    controller.abort()
    await worker.stop()
    const count = looks.mock.calls.length
    await pause()
    expect(looks).toHaveBeenCalledTimes(count)
    await host.close()
  })

  it('finishes a turn whose host closed with recoverable: true while it ran', async () => {
    const { a, b } = twoStores()
    const first = mockAdapter([untilAborted()])
    const hostA = hostOn(a)
    const session = await hostA.open(harnessWith(first.adapter), {
      threadId: THREAD,
    })
    void session.send('Go.', { inputId: 'in-1' }).then(
      () => {},
      () => {},
    )
    await waitFor(() => expect(first.calls).toHaveLength(1))

    // A deploy: host A stops with the turn still running. Its release wakes
    // a worker at once.
    await hostA.close({ recoverable: true })
    expect(await settledRecord(a, 'in-1')).toBeUndefined()
    const next = mockAdapter([() => text('Done.')])
    const hostB = hostOn(b)
    const worker = createHarnessWorker({
      host: hostB,
      harnesses: [harnessWith(next.adapter)],
      pollMs: 10,
    })

    await waitFor(async () =>
      expect(await settledRecord(b, 'in-1')).toMatchObject({
        outcome: 'completed',
      }),
    )
    await worker.stop()
    expect(next.calls).toHaveLength(1)
    await hostB.close()
  })

  it('skips a log that fails to open, so the other logs run', async () => {
    const error = vi.fn<Logger['error']>()
    const inner = memoryLogStore()
    const bad = logIdOf({ logId: 't-bad' })
    const broken = () => Promise.reject(new Error('The disk is gone.'))
    const log = wrapLogStore(inner, {
      read: (query) => (query.logId === bad ? broken() : inner.read(query)),
      getSnapshot: (query) =>
        query.logId === bad ? broken() : inner.getSnapshot(query),
    })
    const { adapter } = mockAdapter([() => text('Done.')])
    const harness = harnessWith(adapter)
    const host = createHarnessHost({
      persistence: { stores: { log } },
      logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error },
    })
    // The broken log is due first, so it is first in each list.
    await submitPrompt(host, harness, 't-bad', 'in-bad')
    await pause()
    await submitPrompt(host, harness, 't-good', 'in-good')

    const worker = createHarnessWorker({
      host,
      harnesses: [harness],
      concurrency: 1,
      pollMs: 5,
    })

    await waitFor(async () =>
      expect(await settledRecord(inner, 'in-good', 't-good')).toMatchObject({
        outcome: 'completed',
      }),
    )
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining('(failure 1 in a row)'),
      { error: expect.any(Error) },
    )
    await worker.stop()
    await host.close()
  })

  it('refuses a concurrency below 1', () => {
    const host = hostOn(memoryLogStore())

    expect(() =>
      createHarnessWorker({
        host,
        harnesses: [],
        concurrency: 0,
      }),
    ).toThrow(RangeError)
  })
})

describe('session.schedule', () => {
  it('runs on the host that has the thread open, at its time', async () => {
    const log = memoryLogStore()
    const { adapter, calls } = mockAdapter([() => text('Scheduled.')])
    const host = hostOn(log)
    const session = await host.open(harnessWith(adapter), { threadId: THREAD })

    const { scheduleId } = await session.schedule({
      at: Date.now() + 30,
      input: { op: 'prompt', message: 'Now.' },
    })
    expect(calls).toHaveLength(0)

    await waitFor(async () =>
      expect(await settledRecord(log, `schedule:${scheduleId}`)).toMatchObject({
        outcome: 'completed',
      }),
    )
    expect(calls).toHaveLength(1)
    await session.close()
    await host.close()
  })

  it('runs once on a worker at its time, when no host has the thread open', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const { a, b } = twoStores()
    const { adapter, calls } = mockAdapter([
      () => text('Report.'),
      () => text('Twice.'),
    ])
    const harness = harnessWith(adapter)
    const planner = hostOn(a)
    const session = await planner.open(harness, { threadId: THREAD })
    const { scheduleId } = await session.schedule({
      at: Date.now() + MINUTE,
      input: { op: 'prompt', message: 'Write the report.' },
      scheduleId: 'daily',
    })
    expect(scheduleId).toBe('daily')
    await session.close()
    await planner.close()
    const runner = hostOn(b)
    const worker = createHarnessWorker({
      host: runner,
      harnesses: [harness],
      pollMs: 5,
    })

    await pause()
    expect(calls).toHaveLength(0)
    moveClock(MINUTE)
    await waitFor(async () =>
      expect(await settledRecord(a, 'schedule:daily')).toMatchObject({
        outcome: 'completed',
      }),
    )
    await pause()
    expect(calls).toHaveLength(1)
    expect(await countOf(a, 'harness.input', 'schedule:daily')).toBe(1)
    expect(await a.listLogsWithoutOwner({ limit: 10 })).toEqual([])
    await worker.stop()
    await runner.close()
  })

  it('does not run after cancelSchedule', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const log = memoryLogStore()
    const { adapter, calls } = mockAdapter([() => text('Report.')])
    const harness = harnessWith(adapter)
    const planner = hostOn(log)
    const session = await planner.open(harness, { threadId: THREAD })
    const { scheduleId } = await session.schedule({
      at: Date.now() + MINUTE,
      input: { op: 'prompt', message: 'Write the report.' },
    })

    await session.cancelSchedule({ scheduleId })
    await session.close()
    await planner.close()
    const runner = hostOn(log)
    const worker = createHarnessWorker({
      host: runner,
      harnesses: [harness],
      pollMs: 5,
    })
    moveClock(MINUTE)
    await pause()

    expect(calls).toHaveLength(0)
    expect(await countOf(log, 'harness.input', `schedule:${scheduleId}`)).toBe(
      0,
    )
    await worker.stop()
    await runner.close()
  })

  it('refuses an at that is not a finite number', async () => {
    const host = hostOn(memoryLogStore())
    const session = await host.open(harnessWith(mockAdapter([]).adapter), {
      threadId: THREAD,
    })

    await expect(
      session.schedule({
        at: Number.NaN,
        input: { op: 'prompt', message: 'Never.' },
      }),
    ).rejects.toThrow(RangeError)
    await session.close()
    await host.close()
  })
})

describe('step.sleep', () => {
  it('goes on after its time on another host, with each step run once', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const { a, b } = twoStores()
    const before = vi.fn(async () => 'mailed')
    const later = vi.fn(async () => 'followed up')
    const followUp = durableTool(
      toolDefinition({
        name: 'follow_up',
        description: 'Mail now, and follow up in a minute',
      }),
      async (_args, { step }) => {
        const first = await step.do('mail', before)
        await step.sleep({ name: 'wait', ms: MINUTE })
        const second = await step.do('follow-up', later)
        return `${first}, ${second}`
      },
    )
    const first = mockAdapter([
      () => toolCall('follow_up', {}, 'call-follow-up'),
    ])
    const sleeper = hostOn(a)
    const session = await sleeper.open(harnessWith(first.adapter, [followUp]), {
      threadId: THREAD,
    })
    const turn = session.send('Mail and follow up.', { inputId: 'mail-1' })
    turn.then(
      () => {},
      () => {},
    )
    await waitFor(async () =>
      expect(
        (await recordsOf(a)).some(
          (record) => record.type === 'harness.schedule',
        ),
      ).toBe(true),
    )
    // A deploy: the host stops its work so that the next host runs it.
    await sleeper.close({ recoverable: true })

    const second = mockAdapter([() => text('Both mails went out.')])
    const harness = harnessWith(second.adapter, [followUp])
    const runner = hostOn(b)
    const worker = createHarnessWorker({
      host: runner,
      harnesses: [harness],
      pollMs: 5,
    })
    await pause()
    expect(later).not.toHaveBeenCalled()
    moveClock(MINUTE)

    await waitFor(async () =>
      expect(await settledRecord(a, 'mail-1')).toMatchObject({
        outcome: 'completed',
      }),
    )
    expect(before).toHaveBeenCalledTimes(1)
    expect(later).toHaveBeenCalledTimes(1)
    expect(second.calls).toHaveLength(1)
    const result = (await recordsOf(a)).find(
      (record) => record.type === 'harness.tool.result',
    )
    expect(result?.message).toMatchObject({
      content: 'mailed, followed up',
    })
    await worker.stop()
    await runner.close()
  })

  it('gives a long sleep back to the store, so it does not keep a worker slot', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const later = vi.fn(async () => 'followed up')
    const followUp = durableTool(
      toolDefinition({
        name: 'follow_up',
        description: 'Follow up in a minute',
      }),
      async (_args, { step }) => {
        await step.sleep({ name: 'wait', ms: MINUTE })
        return step.do('follow-up', later)
      },
    )
    const { adapter, calls } = mockAdapter([
      () => toolCall('follow_up', {}, 'call-follow-up'),
      () => text('Other done.'),
      () => text('Followed up.'),
    ])
    const harness = harnessWith(adapter, [followUp])
    const log = memoryLogStore()
    const host = hostOn(log)
    await submitPrompt(host, harness, 't-sleep', 'in-sleep')
    await pause()
    await submitPrompt(host, harness, 't-other', 'in-other')

    const worker = createHarnessWorker({
      host,
      harnesses: [harness],
      concurrency: 1,
      pollMs: 5,
    })
    // One slot: the other thread runs while the first one sleeps.
    await waitFor(async () =>
      expect(await settledRecord(log, 'in-other', 't-other')).toMatchObject({
        outcome: 'completed',
      }),
    )
    expect(host.isOpen(harness, { threadId: 't-sleep' })).toBe(false)
    expect(later).not.toHaveBeenCalled()

    moveClock(MINUTE)
    await waitFor(async () =>
      expect(await settledRecord(log, 'in-sleep', 't-sleep')).toMatchObject({
        outcome: 'completed',
      }),
    )
    expect(later).toHaveBeenCalledTimes(1)
    expect(calls).toHaveLength(3)
    await worker.stop()
    await host.close()
  })
})
