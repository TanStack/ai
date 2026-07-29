/**
 * Coverage for the retargeted run driver (`src/run.ts`): `pipeToRunLog` and
 * `RunController` now drive core's `RunStore` + `StreamDurability` pair instead
 * of the package-local event log.
 *
 * Two things this file asserts deliberately and directly, because both used to
 * be observable only as a 4-second Playwright-style hang or as a stray
 * "Unhandled Rejection" note in the runner's output:
 *
 * 1. `durability.close()` is called EXACTLY ONCE on every terminal path.
 *    Deleting the close previously failed five tests purely via timeouts (the
 *    already-aborted test passed, so one path's log terminalization had no
 *    coverage at all). The `closes` counter turns that into an instant,
 *    legible failure.
 * 2. `pipeToRunLog` RESOLVES on every store/event-log failure and reports the
 *    failure through its logger. It is consumed fire-and-forget, so a rejection
 *    has no caller to reach and a silently absorbed failure is invisible.
 */
import { describe, expect, it } from 'vitest'
import { EventType, InMemoryRunStore, memoryStream } from '@tanstack/ai'
import { captureLogger } from './fakes'
import { RunController, pipeToRunLog } from '../src'
import type {
  RunRecord,
  RunStore,
  StreamChunk,
  StreamDurability,
} from '@tanstack/ai'

function producerRequest(runId: string): Request {
  return new Request(`http://test.local/api/chat?runId=${runId}`, {
    method: 'POST',
  })
}

function joinRequest(runId: string): Request {
  return new Request(`http://test.local/api/chat?runId=${runId}&offset=-1`, {
    method: 'GET',
  })
}

function textChunk(delta: string): StreamChunk {
  return {
    type: EventType.TEXT_MESSAGE_CONTENT,
    messageId: 'm1',
    delta,
    content: delta,
    timestamp: 1,
  } as unknown as StreamChunk
}

async function* twoChunks(): AsyncGenerator<StreamChunk> {
  yield textChunk('hello ')
  yield textChunk('world')
}

async function* throwing(): AsyncGenerator<StreamChunk> {
  yield textChunk('partial')
  throw new Error('provider exploded')
}

/** Build a `RUN_ERROR` chunk, mirroring `syntheticRunError` in `src/run.ts`. */
function runErrorChunk(message: string, code?: string): StreamChunk {
  const chunk: { type: EventType.RUN_ERROR; message: string; code?: string } = {
    type: EventType.RUN_ERROR,
    message,
    ...(code === undefined ? {} : { code }),
  }
  return chunk
}

async function* chunkThenRunError(code?: string): AsyncGenerator<StreamChunk> {
  yield textChunk('partial')
  yield runErrorChunk('provider rejected the request', code)
}

/** Aborts `controller` between the first and second yielded chunk. */
async function* abortAfterFirstChunk(
  controller: AbortController,
): AsyncGenerator<StreamChunk> {
  yield textChunk('before-abort')
  controller.abort()
  yield textChunk('after-abort')
}

/**
 * A `memoryStream` durability that counts `close()` calls (so terminalization
 * is asserted directly rather than inferred from a hang) and can be made to
 * fail a chosen `append` or its `close`.
 */
function recordingDurability(
  runId: string,
  faults: {
    append?: (chunks: Array<StreamChunk>) => void
    close?: () => void
  } = {},
): {
  durability: StreamDurability
  calls: { appends: number; closes: number }
} {
  const inner = memoryStream(producerRequest(runId))
  const calls = { appends: 0, closes: 0 }
  const durability: StreamDurability = {
    resumeFrom: () => inner.resumeFrom(),
    read: (offset, signal) => inner.read(offset, signal),
    append: (chunks) => {
      calls.appends++
      faults.append?.(chunks)
      return inner.append(chunks)
    },
    close: () => {
      calls.closes++
      faults.close?.()
      return inner.close()
    },
    // Delegate to the wrapped `memoryStream`, which is the actual store of
    // record for this fake.
    snapshot: () => inner.snapshot(),
  }
  return { durability, calls }
}

/**
 * An `InMemoryRunStore` whose three required methods can be made to fail, or
 * (for `get`) to answer `null` the way an eventually-consistent / read-replica
 * backend can for a run that was just driven.
 */
function faultyRunStore(faults: {
  createOrResume?: () => void
  update?: () => void
  get?: 'throw' | 'null'
}): RunStore {
  const inner = new InMemoryRunStore()
  return {
    createOrResume: (input) => {
      faults.createOrResume?.()
      return inner.createOrResume(input)
    },
    update: (runId, patch) => {
      faults.update?.()
      return inner.update(runId, patch)
    },
    get: (runId) => {
      if (faults.get === 'throw') throw new Error('run store read failed')
      if (faults.get === 'null') return Promise.resolve(null)
      return inner.get(runId)
    },
  }
}

/** Whether an `errors`-level log line matching `fragment` was emitted. */
function loggedError(
  calls: Array<{ level: string; msg: string }>,
  fragment: string,
): boolean {
  return calls.some(
    (call) => call.level === 'error' && call.msg.includes(fragment),
  )
}

/** Replay a finished run's log from the start and collect every chunk. */
async function replay(runId: string): Promise<Array<StreamChunk>> {
  const chunks: Array<StreamChunk> = []
  for await (const event of memoryStream(joinRequest(runId)).read('-1')) {
    chunks.push(event.chunk)
  }
  return chunks
}

/**
 * Let Node's unhandled-rejection bookkeeping run. A rejection is reported only
 * after the microtask queue drains, so a macrotask hop is required before
 * asserting that none was reported.
 */
async function settleUnhandledRejections(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0))
  await new Promise((resolve) => setTimeout(resolve, 0))
}

describe('pipeToRunLog', () => {
  it('records a completed run, appends every chunk, and closes the log once', async () => {
    const runs = new InMemoryRunStore()
    const { durability, calls } = recordingDurability('r1')
    const record = await pipeToRunLog(twoChunks(), {
      runs,
      durability: () => durability,
      runId: 'r1',
      threadId: 't1',
    })

    expect(record.status).toBe('completed')
    expect(record.threadId).toBe('t1')
    expect((await runs.get('r1'))?.status).toBe('completed')
    expect(calls.closes).toBe(1)

    const deltas: Array<string> = []
    for (const chunk of await replay('r1')) {
      if (chunk.type === EventType.TEXT_MESSAGE_CONTENT)
        deltas.push(chunk.delta)
    }
    expect(deltas).toEqual(['hello ', 'world'])
  })

  it('never rejects on a stream error: records failed plus a RUN_ERROR event, closing the log once', async () => {
    const runs = new InMemoryRunStore()
    const { durability, calls } = recordingDurability('r2')
    const record = await pipeToRunLog(throwing(), {
      runs,
      durability: () => durability,
      runId: 'r2',
      threadId: 't1',
    })

    expect(record.status).toBe('failed')
    expect(record.error?.message).toContain('provider exploded')
    expect(calls.closes).toBe(1)

    const types = (await replay('r2')).map((chunk) => chunk.type)
    expect(types).toContain(EventType.RUN_ERROR)
  })

  it('finishes as aborted when the signal is already aborted, still closing the log once', async () => {
    const runs = new InMemoryRunStore()
    const { durability, calls } = recordingDurability('r3')
    const controller = new AbortController()
    controller.abort()
    const record = await pipeToRunLog(twoChunks(), {
      runs,
      durability: () => durability,
      runId: 'r3',
      threadId: 't1',
      signal: controller.signal,
    })
    expect(record.status).toBe('aborted')
    expect(calls.closes).toBe(1)
  })

  it('finishes failed on a RUN_ERROR chunk, capturing its message and logging the event', async () => {
    const runs = new InMemoryRunStore()
    const { durability, calls } = recordingDurability('r6')
    const record = await pipeToRunLog(chunkThenRunError(), {
      runs,
      durability: () => durability,
      runId: 'r6',
      threadId: 't1',
    })

    expect(record.status).toBe('failed')
    expect(record.error?.message).toBe('provider rejected the request')
    expect(calls.closes).toBe(1)

    const events = await replay('r6')
    expect(events.some((chunk) => chunk.type === EventType.RUN_ERROR)).toBe(
      true,
    )
  })

  it("keeps a RUN_ERROR chunk's machine-branchable code on the record", async () => {
    const runs = new InMemoryRunStore()
    const { durability } = recordingDurability('r9')
    const record = await pipeToRunLog(chunkThenRunError('rate_limited'), {
      runs,
      durability: () => durability,
      runId: 'r9',
      threadId: 't1',
    })

    expect(record.error).toEqual({
      message: 'provider rejected the request',
      code: 'rate_limited',
    })
  })

  it('finishes aborted mid-stream, keeping chunks appended before the abort replayable', async () => {
    const runs = new InMemoryRunStore()
    const { durability, calls } = recordingDurability('r7')
    const controller = new AbortController()
    const record = await pipeToRunLog(abortAfterFirstChunk(controller), {
      runs,
      durability: () => durability,
      runId: 'r7',
      threadId: 't1',
      signal: controller.signal,
    })

    expect(record.status).toBe('aborted')
    expect(calls.closes).toBe(1)

    const deltas: Array<string> = []
    for (const chunk of await replay('r7')) {
      if (chunk.type === EventType.TEXT_MESSAGE_CONTENT)
        deltas.push(chunk.delta)
    }
    expect(deltas).toEqual(['before-abort'])
  })
})

describe('pipeToRunLog failure absorption', () => {
  it('still closes the log (and logs) when the terminal runs.update throws', async () => {
    const runs = faultyRunStore({
      update: () => {
        throw new Error('store update failed')
      },
    })
    const { durability, calls } = recordingDurability('f1')
    const { logger, calls: logs } = captureLogger()

    const record = await pipeToRunLog(twoChunks(), {
      runs,
      durability: () => durability,
      logger,
      runId: 'f1',
      threadId: 't1',
    })

    // Without a guaranteed close the record would be wedged at `running` and
    // every live tailer would park forever, since `read` ends only on close.
    expect(calls.closes).toBe(1)
    expect(record.status).toBe('completed')
    expect(record.runId).toBe('f1')
    expect(record.threadId).toBe('t1')
    expect(loggedError(logs, 'recording the terminal run record failed')).toBe(
      true,
    )
  })

  it('still terminalizes when the logger itself throws', async () => {
    // The logger is consumer-supplied and is handed arbitrary thrown values, so
    // a sink that cannot serialize one would throw from inside a `catch` body
    // and escape it. That would skip `durability.close()` and wedge the record
    // at `running`, defeating the totality the logger exists to report on.
    const runs = new InMemoryRunStore()
    runs.update = () => {
      throw new Error('store update failed')
    }
    const { durability, calls } = recordingDurability('f-log')
    const exploding = {
      errors: () => {
        throw new Error('logger sink exploded')
      },
    } as unknown as Parameters<typeof pipeToRunLog>[1]['logger']

    const record = await pipeToRunLog(twoChunks(), {
      runs,
      durability: () => durability,
      logger: exploding,
      runId: 'f-log',
      threadId: 't1',
    })

    expect(calls.closes).toBe(1)
    expect(record.status).toBe('completed')
  })

  it('resolves and logs when durability.close() itself throws', async () => {
    const runs = new InMemoryRunStore()
    const { durability, calls } = recordingDurability('f2', {
      close: () => {
        throw new Error('close failed')
      },
    })
    const { logger, calls: logs } = captureLogger()

    const record = await pipeToRunLog(twoChunks(), {
      runs,
      durability: () => durability,
      logger,
      runId: 'f2',
      threadId: 't1',
    })

    expect(record.status).toBe('completed')
    expect(calls.closes).toBe(1)
    expect(loggedError(logs, 'closing the run event log failed')).toBe(true)
  })

  it('records the ORIGINAL provider error when the recovery append throws', async () => {
    const runs = new InMemoryRunStore()
    const { durability, calls } = recordingDurability('f3', {
      append: (chunks) => {
        if (chunks.some((chunk) => chunk.type === EventType.RUN_ERROR)) {
          throw new Error('log write failed')
        }
      },
    })
    const { logger, calls: logs } = captureLogger()

    const record = await pipeToRunLog(throwing(), {
      runs,
      durability: () => durability,
      logger,
      runId: 'f3',
      threadId: 't1',
    })

    expect(record.status).toBe('failed')
    // The secondary failure must be merged in, never substituted for the cause.
    expect(record.error?.message).toContain('provider exploded')
    expect(record.error?.message).toContain('log write failed')
    expect(calls.closes).toBe(1)
    expect(
      loggedError(logs, 'appending the synthesized RUN_ERROR failed'),
    ).toBe(true)
  })

  it('handles a throwing runs.createOrResume as a failed run rather than rejecting', async () => {
    const runs = faultyRunStore({
      createOrResume: () => {
        throw new Error('store create failed')
      },
    })
    const { durability, calls } = recordingDurability('f4')
    const { logger, calls: logs } = captureLogger()

    const record = await pipeToRunLog(twoChunks(), {
      runs,
      durability: () => durability,
      logger,
      runId: 'f4',
      threadId: 't1',
    })

    expect(record.status).toBe('failed')
    expect(record.error?.message).toContain('store create failed')
    expect(calls.closes).toBe(1)
    // Not "the stream failed": createOrResume threw, so the stream never ran.
    expect(loggedError(logs, 'the run failed before completing')).toBe(true)

    // The synthesized RUN_ERROR still reached the log, so a tailer sees why.
    const types = (await replay('f4')).map((chunk) => chunk.type)
    expect(types).toContain(EventType.RUN_ERROR)
  })

  it('rebuilds the terminal record when runs.get answers null on the re-read', async () => {
    const runs = faultyRunStore({ get: 'null' })
    const { durability, calls } = recordingDurability('f5')
    const { logger, calls: logs } = captureLogger()

    const record = await pipeToRunLog(twoChunks(), {
      runs,
      durability: () => durability,
      logger,
      runId: 'f5',
      threadId: 't1',
    })

    // An eventually-consistent read must not turn a successful run into a
    // rejection ("record vanished mid-run").
    expect(record.status).toBe('completed')
    expect(record.runId).toBe('f5')
    expect(record.threadId).toBe('t1')
    expect(record.finishedAt).toBeTypeOf('number')
    expect(calls.closes).toBe(1)
    expect(
      loggedError(logs, 'record vanished before the terminal re-read'),
    ).toBe(true)
  })

  it('resolves and logs when runs.get throws on the re-read', async () => {
    const runs = faultyRunStore({ get: 'throw' })
    const { durability, calls } = recordingDurability('f6')
    const { logger, calls: logs } = captureLogger()

    const record = await pipeToRunLog(twoChunks(), {
      runs,
      durability: () => durability,
      logger,
      runId: 'f6',
      threadId: 't1',
    })

    expect(record.status).toBe('completed')
    expect(calls.closes).toBe(1)
    expect(loggedError(logs, 're-reading the terminal run record failed')).toBe(
      true,
    )
  })
})

describe('RunController', () => {
  it('start returns immediately and done resolves with the terminal record', async () => {
    const runs = new InMemoryRunStore()
    const durability = memoryStream(producerRequest('r4'))
    const controller = new RunController({ runs, durability: () => durability })
    const handle = controller.start({
      runId: 'r4',
      threadId: 't1',
      stream: twoChunks(),
    })
    expect(handle.runId).toBe('r4')
    const record = await handle.done
    expect(record.status).toBe('completed')
  })

  it('status reads the record and drain awaits in-flight runs', async () => {
    const runs = new InMemoryRunStore()
    const durability = memoryStream(producerRequest('r5'))
    const controller = new RunController({ runs, durability: () => durability })
    controller.start({ runId: 'r5', threadId: 't1', stream: twoChunks() })
    await controller.drain()
    expect((await controller.status('r5'))?.status).toBe('completed')
  })

  it("attach replays from an opaque offset (memoryStream's '-1' from-start sentinel)", async () => {
    const runs = new InMemoryRunStore()
    const durability = memoryStream(producerRequest('r8'))
    const controller = new RunController({ runs, durability: () => durability })
    const handle = controller.start({
      runId: 'r8',
      threadId: 't1',
      stream: twoChunks(),
    })
    await handle.done

    const deltas: Array<string> = []
    for await (const event of controller.attach('r8', '-1')) {
      if (event.chunk.type === EventType.TEXT_MESSAGE_CONTENT)
        deltas.push(event.chunk.delta)
    }
    expect(deltas).toEqual(['hello ', 'world'])
  })

  it('leaves no unhandled rejection behind when a run hits store failures', async () => {
    // `start()`'s in-flight bookkeeping used `void done.finally(...)`, whose NEW
    // promise adopts any rejection with nobody left to handle it: fatal on
    // modern Node defaults, and it kills the instance inside a Durable Object.
    // Drive a fault-injected run (the shape that used to reject) and assert
    // both halves separately: the process saw nothing unhandled, AND the run
    // settled fulfilled. Settling `done` without `await`ing it directly keeps
    // the two assertions independent, so a reintroduced rejection is reported
    // as an unhandled-rejection failure rather than as a thrown await.
    const rejections: Array<unknown> = []
    const onUnhandled = (reason: unknown): void => void rejections.push(reason)
    process.on('unhandledRejection', onUnhandled)
    try {
      const runs = faultyRunStore({
        update: () => {
          throw new Error('store update failed')
        },
      })
      const { durability } = recordingDurability('f7')
      const { logger } = captureLogger()
      const controller = new RunController({
        runs,
        durability: () => durability,
        logger,
      })

      const handle = controller.start({
        runId: 'f7',
        threadId: 't1',
        stream: throwing(),
      })
      const outcome = await handle.done.then(
        (record: RunRecord) => ({ rejected: false, record }),
        (error: unknown) => ({ rejected: true, error }),
      )
      await controller.drain()
      await settleUnhandledRejections()

      expect(rejections).toEqual([])
      expect(outcome).toMatchObject({
        rejected: false,
        record: { status: 'failed' },
      })
    } finally {
      process.off('unhandledRejection', onUnhandled)
    }
  })
})
