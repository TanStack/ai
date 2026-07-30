import { describe, expect, it, vi } from 'vitest'
import {
  EventType,
  InMemoryRunStore,
  memoryStream,
  resolveResumeRunId,
  resumeHttpResponse,
  resumeServerSentEventsResponse,
} from '../src/index'
import { InMemoryLockStore } from '../src/locks'
import { InternalLogger } from '../src/adapter-internals'
import type { RunRecord, RunStore, StreamChunk } from '../src/index'
import type { LockStore } from '../src/locks'
import type { Logger } from '../src/logger/types'

function req(runId: string, offset = '-1'): Request {
  return new Request(`https://x/attach?runId=${runId}&offset=${offset}`)
}

async function* one(runId: string): AsyncIterable<StreamChunk> {
  yield { type: EventType.RUN_STARTED, runId, threadId: 't1', timestamp: 1 }
}

/**
 * A settled-promise the TEST owns, built from the `waitUntil` hook the driver
 * options already expose. The production helper must not grow a test hook, so
 * the determinism comes from here: `startRunDriver` calls `waitUntil`
 * synchronously with its background promise, and `settled` adopts it (so a
 * drive that rejects makes `settled` reject too). If the helper never starts a
 * driver at all, `settled` rejects with a named error instead of hanging.
 */
function settledHook(): {
  settled: Promise<void>
  onStart: (promise: Promise<unknown>) => void
} {
  let onStart!: (promise: Promise<unknown>) => void
  const settled = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('the run driver was never started')),
      1_000,
    )
    onStart = (promise) => {
      clearTimeout(timer)
      promise.then(() => resolve(), reject)
    }
  })
  return { settled, onStart }
}

function immediateClaim<T>(
  input: { runs: RunStore; locks: LockStore; runId: string },
  fn: (claim: {
    runId: string
    epoch: number
    signal: AbortSignal
  }) => Promise<T>,
): Promise<T> {
  return fn({
    runId: input.runId,
    epoch: 1,
    signal: new AbortController().signal,
  })
}

function baseDriver(runs: RunStore, request: Request) {
  const { settled, onStart } = settledHook()
  return {
    request,
    runs,
    locks: new InMemoryLockStore(),
    claim: immediateClaim,
    pipe: vi.fn(() => Promise.resolve()),
    drive: vi.fn(({ runId }: { runId: string }) => one(runId)),
    waitUntil: onStart,
    settled,
  }
}

function collectingLogger(): {
  logger: InternalLogger
  debug: Array<string>
  errors: Array<string>
} {
  const debug: Array<string> = []
  const errors: Array<string> = []
  const sink: Logger = {
    debug: (message) => debug.push(message),
    info: () => {},
    warn: () => {},
    error: (message) => errors.push(message),
  }
  return {
    logger: new InternalLogger(sink, {
      request: true,
      provider: true,
      output: true,
      middleware: true,
      tools: true,
      agentLoop: true,
      config: true,
      errors: true,
      sandbox: true,
    }),
    debug,
    errors,
  }
}

describe('resolveResumeRunId', () => {
  it('prefers the X-Run-Id header over the query', () => {
    const request = new Request('https://x/attach?runId=from-query', {
      headers: { 'X-Run-Id': 'from-header' },
    })
    expect(resolveResumeRunId(request)).toBe('from-header')
  })

  it('falls back to the ?runId query', () => {
    expect(resolveResumeRunId(req('rd-resolve'))).toBe('rd-resolve')
  })

  it('returns null when neither is present, rather than inventing one', () => {
    expect(
      resolveResumeRunId(new Request('https://x/attach?offset=-1')),
    ).toBeNull()
  })
})

describe('resumeServerSentEventsResponse — driver', () => {
  it('still 400s with no resume offset, and does not drive', async () => {
    const runs = new InMemoryRunStore()
    await runs.createOrResume({
      runId: 'rd-sse-400',
      threadId: 't1',
      startedAt: 1,
    })
    const request = new Request('https://x/attach?runId=rd-sse-400')
    const driver = baseDriver(runs, request)

    const response = resumeServerSentEventsResponse({
      adapter: memoryStream(request),
      driver,
    })

    expect(response.status).toBe(400)
    // The 400 comes first: driving a run whose response will 400 would start an
    // agent nobody is watching.
    await expect(driver.settled).rejects.toThrow(
      'the run driver was never started',
    )
    expect(driver.drive).not.toHaveBeenCalled()
  })

  it('drives the run when the record is non-terminal', async () => {
    const runs = new InMemoryRunStore()
    await runs.createOrResume({
      runId: 'rd-sse-drive',
      threadId: 't1',
      startedAt: 1,
    })
    const request = req('rd-sse-drive')
    const driver = baseDriver(runs, request)

    const response = resumeServerSentEventsResponse({
      adapter: memoryStream(request),
      driver,
    })

    expect(response.status).toBe(200)
    await driver.settled
    expect(driver.drive).toHaveBeenCalledTimes(1)
    expect(driver.drive.mock.calls[0]?.[0]).toMatchObject({
      runId: 'rd-sse-drive',
      threadId: 't1',
    })
    expect(driver.pipe).toHaveBeenCalledTimes(1)
  })

  it('does NOT drive a terminal run, but still serves the log', async () => {
    const runs = new InMemoryRunStore()
    await runs.createOrResume({
      runId: 'rd-sse-terminal',
      threadId: 't1',
      startedAt: 1,
    })
    await runs.update('rd-sse-terminal', { status: 'completed', finishedAt: 2 })
    const request = req('rd-sse-terminal')
    const driver = baseDriver(runs, request)

    const response = resumeServerSentEventsResponse({
      adapter: memoryStream(request),
      driver,
    })

    expect(response.status).toBe(200)
    await driver.settled
    expect(driver.drive).not.toHaveBeenCalled()
  })

  // The driver's gate reads `status` straight off a user-implemented store, and
  // an unrecognized value means the run cannot be reasoned about at all. Driving
  // it would be worse than not: the record says nothing trustworthy about
  // whether an agent is already running. So an invalid status is refused the same
  // way a terminal one is — and the log is still served, which is what keeps a
  // corrupt row from also blanking the transcript.
  it('does NOT drive a run whose stored status is not a RunStatus', async () => {
    const request = req('rd-sse-bad-status')
    const { logger, errors } = collectingLogger()
    const runs = new InMemoryRunStore()
    await runs.createOrResume({
      runId: 'rd-sse-bad-status',
      threadId: 't1',
      startedAt: 1,
    })
    // `JSON.parse` is `any`: a real backend's deserializer widens a row to
    // `RunRecord` without validating the `status` column, and that is the exact
    // unsoundness reproduced here. `'toString'` is an `Object.prototype` key, so
    // a prototype-chain `in` check would have called it terminal.
    const malformed: RunRecord = JSON.parse(
      JSON.stringify({
        runId: 'rd-sse-bad-status',
        threadId: 't1',
        startedAt: 1,
        status: 'toString',
      }),
    )
    const corruptRuns: RunStore = {
      createOrResume: (input) => runs.createOrResume(input),
      update: (runId, patch) => runs.update(runId, patch),
      get: () => Promise.resolve(malformed),
    }
    const driver = { ...baseDriver(corruptRuns, request), logger }

    const response = resumeServerSentEventsResponse({
      adapter: memoryStream(request),
      driver,
    })

    expect(response.status).toBe(200)
    await expect(driver.settled).resolves.toBeUndefined()
    expect(driver.drive).not.toHaveBeenCalled()
    expect(errors.join('\n')).toContain(
      'resume driver: the run record has an unrecognized status',
    )
  })

  it('does NOT drive an unknown run', async () => {
    const request = req('rd-sse-missing')
    const driver = baseDriver(new InMemoryRunStore(), request)

    const response = resumeServerSentEventsResponse({
      adapter: memoryStream(request),
      driver,
    })

    expect(response.status).toBe(200)
    await driver.settled
    expect(driver.drive).not.toHaveBeenCalled()
  })

  it('does NOT drive when the request names no run at all', async () => {
    const request = new Request('https://x/attach?offset=-1')
    const driver = baseDriver(new InMemoryRunStore(), request)

    const response = resumeServerSentEventsResponse({
      adapter: memoryStream(request),
      driver,
    })

    expect(response.status).toBe(200)
    await driver.settled
    expect(driver.drive).not.toHaveBeenCalled()
  })

  it('clears detachedSince under the claim, so the reaper stops counting', async () => {
    const runs = new InMemoryRunStore()
    await runs.createOrResume({
      runId: 'rd-sse-detached',
      threadId: 't1',
      startedAt: 1,
    })
    await runs.update('rd-sse-detached', { detachedSince: 1_000 })
    const request = req('rd-sse-detached')

    let insideClaim = false
    const clearedInsideClaim: Array<boolean> = []
    const observedRuns: RunStore = {
      createOrResume: (input) => runs.createOrResume(input),
      get: (runId) => runs.get(runId),
      update: (runId, patch) => {
        if ('detachedSince' in patch) clearedInsideClaim.push(insideClaim)
        return runs.update(runId, patch)
      },
    }
    const driver = {
      ...baseDriver(observedRuns, request),
      claim: <T>(
        input: { runs: RunStore; locks: LockStore; runId: string },
        fn: (claim: {
          runId: string
          epoch: number
          signal: AbortSignal
        }) => Promise<T>,
      ) => {
        insideClaim = true
        return immediateClaim(input, fn).finally(() => {
          insideClaim = false
        })
      },
    }

    resumeServerSentEventsResponse({
      adapter: memoryStream(request),
      driver,
    })

    await driver.settled
    expect((await runs.get('rd-sse-detached'))?.detachedSince).toBeUndefined()
    expect(clearedInsideClaim).toEqual([true])
  })

  it('does NOT drive a run whose cancel was already recorded out of band', async () => {
    // `requestRunCancel` deliberately writes no status: a run cancelled while
    // its driving host was already dead stays `running` with
    // `cancelRequested: true`. Claiming and driving it resurrects a run the user
    // explicitly stopped and burns tokens until the TTL.
    const runs = new InMemoryRunStore()
    await runs.createOrResume({
      runId: 'rd-sse-cancelled',
      threadId: 't1',
      startedAt: 1,
    })
    await runs.update('rd-sse-cancelled', { cancelRequested: true })
    const request = req('rd-sse-cancelled')
    const driver = baseDriver(runs, request)

    const response = resumeServerSentEventsResponse({
      adapter: memoryStream(request),
      driver,
    })

    // The log is still served — a tab attaching to a cancelled run must see the
    // transcript — but nothing is driven.
    expect(response.status).toBe(200)
    await driver.settled
    expect(driver.drive).not.toHaveBeenCalled()
    expect(driver.pipe).not.toHaveBeenCalled()
  })

  it('still drives when the detachedSince bookkeeping write fails, and logs it as an error', async () => {
    // The `detachedSince` clear is bookkeeping for the reaper's TTL accounting.
    // A transient store failure there used to propagate into the "someone else
    // won the lease" catch, costing the ENTIRE takeover of a successfully
    // acquired claim — and logging it on the `provider` debug channel, invisible
    // at default log levels.
    const runs = new InMemoryRunStore()
    await runs.createOrResume({
      runId: 'rd-sse-clear-fails',
      threadId: 't1',
      startedAt: 1,
    })
    await runs.update('rd-sse-clear-fails', { detachedSince: 1_000 })
    const request = req('rd-sse-clear-fails')
    const { logger, errors } = collectingLogger()
    const failingRuns: RunStore = {
      createOrResume: (input) => runs.createOrResume(input),
      get: (runId) => runs.get(runId),
      update: (runId, patch) =>
        'detachedSince' in patch
          ? Promise.reject(new Error('store down'))
          : runs.update(runId, patch),
    }
    const driver = { ...baseDriver(failingRuns, request), logger }

    resumeServerSentEventsResponse({
      adapter: memoryStream(request),
      driver,
    })

    await expect(driver.settled).resolves.toBeUndefined()
    expect(driver.drive).toHaveBeenCalledTimes(1)
    expect(driver.pipe).toHaveBeenCalledTimes(1)
    expect(errors.join('\n')).toContain(
      'resume driver: clearing detachedSince failed',
    )
  })

  it('never rejects when the claim is refused — a loser still serves the log', async () => {
    const runs = new InMemoryRunStore()
    await runs.createOrResume({
      runId: 'rd-sse-refused',
      threadId: 't1',
      startedAt: 1,
    })
    const request = req('rd-sse-refused')
    const { logger, debug } = collectingLogger()
    const driver = {
      ...baseDriver(runs, request),
      claim: () => Promise.reject(new Error('claim not acquired')),
      logger,
    }

    const response = resumeServerSentEventsResponse({
      adapter: memoryStream(request),
      driver,
    })

    expect(response.status).toBe(200)
    await expect(driver.settled).resolves.toBeUndefined()
    expect(driver.drive).not.toHaveBeenCalled()
    expect(debug.join('\n')).toContain('resume driver: not driving this run')
  })

  it('swallows and logs a thrown drive, leaving the response unaffected', async () => {
    const runs = new InMemoryRunStore()
    await runs.createOrResume({
      runId: 'rd-sse-throws',
      threadId: 't1',
      startedAt: 1,
    })
    const request = req('rd-sse-throws')
    const { logger, debug } = collectingLogger()
    const driver = {
      ...baseDriver(runs, request),
      drive: vi.fn(
        (): AsyncIterable<StreamChunk> =>
          (async function* () {
            throw new Error('drive exploded')
          })(),
      ),
      // A real pipe: iterating the driven stream is what surfaces the throw.
      pipe: vi.fn(async (stream: AsyncIterable<StreamChunk>) => {
        for await (const _chunk of stream) {
          // drain
        }
      }),
      logger,
    }

    const response = resumeServerSentEventsResponse({
      adapter: memoryStream(request),
      driver,
    })

    expect(response.status).toBe(200)
    await expect(driver.settled).resolves.toBeUndefined()
    expect(debug.join('\n')).toContain('resume driver: not driving this run')
  })

  it('swallows a run-store read failure', async () => {
    const request = req('rd-sse-store-fails')
    const { logger, errors } = collectingLogger()
    const runs = new InMemoryRunStore()
    const failingRuns: RunStore = {
      createOrResume: (input) => runs.createOrResume(input),
      update: (runId, patch) => runs.update(runId, patch),
      get: () => Promise.reject(new Error('store down')),
    }
    const driver = { ...baseDriver(failingRuns, request), logger }

    const response = resumeServerSentEventsResponse({
      adapter: memoryStream(request),
      driver,
    })

    expect(response.status).toBe(200)
    await expect(driver.settled).resolves.toBeUndefined()
    expect(driver.drive).not.toHaveBeenCalled()
    expect(errors.join('\n')).toContain(
      'resume driver: reading the run record failed',
    )
  })

  it('routes the drive promise through waitUntil when supplied', async () => {
    const runs = new InMemoryRunStore()
    await runs.createOrResume({
      runId: 'rd-sse-waituntil',
      threadId: 't1',
      startedAt: 1,
    })
    const request = req('rd-sse-waituntil')
    const base = baseDriver(runs, request)
    const waitUntil = vi.fn((promise: Promise<unknown>) => {
      base.waitUntil(promise)
    })

    resumeServerSentEventsResponse({
      adapter: memoryStream(request),
      driver: { ...base, waitUntil },
    })

    expect(waitUntil).toHaveBeenCalledTimes(1)
    await base.settled
  })

  it('behaves exactly as before when no driver is supplied', () => {
    const response = resumeServerSentEventsResponse({
      adapter: memoryStream(req('rd-sse-nodriver')),
    })
    expect(response.status).toBe(200)
  })

  it('never leaks the driver into the Response init', async () => {
    const runs = new InMemoryRunStore()
    await runs.createOrResume({
      runId: 'rd-sse-noleak',
      threadId: 't1',
      startedAt: 1,
    })
    const request = req('rd-sse-noleak')
    const driver = baseDriver(runs, request)
    const seen: Array<ResponseInit | undefined> = []
    const RealResponse = globalThis.Response
    class SpyResponse extends RealResponse {
      constructor(body?: BodyInit | null, init?: ResponseInit) {
        seen.push(init)
        super(body, init)
      }
    }
    globalThis.Response = SpyResponse
    try {
      resumeServerSentEventsResponse({
        adapter: memoryStream(request),
        driver,
      })
    } finally {
      globalThis.Response = RealResponse
    }

    expect(seen.length).toBeGreaterThan(0)
    for (const init of seen) {
      expect(init === undefined || !('driver' in init)).toBe(true)
    }
    await driver.settled
  })
})

describe('resumeHttpResponse — driver', () => {
  it('drives the run identically to the SSE helper', async () => {
    const runs = new InMemoryRunStore()
    await runs.createOrResume({
      runId: 'rd-http-drive',
      threadId: 't1',
      startedAt: 1,
    })
    const request = req('rd-http-drive')
    const driver = baseDriver(runs, request)

    const response = resumeHttpResponse({
      adapter: memoryStream(request),
      driver,
    })

    expect(response.status).toBe(200)
    await driver.settled
    expect(driver.drive).toHaveBeenCalledTimes(1)
    expect(driver.drive.mock.calls[0]?.[0]).toMatchObject({
      runId: 'rd-http-drive',
      threadId: 't1',
    })
    expect(driver.pipe).toHaveBeenCalledTimes(1)
  })

  it('still 400s with no resume offset, and does not drive', async () => {
    const runs = new InMemoryRunStore()
    await runs.createOrResume({
      runId: 'rd-http-400',
      threadId: 't1',
      startedAt: 1,
    })
    const request = new Request('https://x/attach?runId=rd-http-400')
    const driver = baseDriver(runs, request)

    const response = resumeHttpResponse({
      adapter: memoryStream(request),
      driver,
    })

    expect(response.status).toBe(400)
    await expect(driver.settled).rejects.toThrow(
      'the run driver was never started',
    )
    expect(driver.drive).not.toHaveBeenCalled()
  })

  it('never leaks the driver into the Response init', async () => {
    const runs = new InMemoryRunStore()
    await runs.createOrResume({
      runId: 'rd-http-noleak',
      threadId: 't1',
      startedAt: 1,
    })
    const request = req('rd-http-noleak')
    const driver = baseDriver(runs, request)
    const seen: Array<ResponseInit | undefined> = []
    const RealResponse = globalThis.Response
    class SpyResponse extends RealResponse {
      constructor(body?: BodyInit | null, init?: ResponseInit) {
        seen.push(init)
        super(body, init)
      }
    }
    globalThis.Response = SpyResponse
    try {
      resumeHttpResponse({ adapter: memoryStream(request), driver })
    } finally {
      globalThis.Response = RealResponse
    }

    expect(seen.length).toBeGreaterThan(0)
    for (const init of seen) {
      expect(init === undefined || !('driver' in init)).toBe(true)
    }
    await driver.settled
  })
})
