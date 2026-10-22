import { describe, expect, it } from 'vitest'
import {
  memoryLogState,
  memoryLogStore,
  memoryPersistence,
} from '@tanstack/ai-persistence'
import { createHarnessHost, defineHarness } from '../src'
import { createHarnessHandler } from '../src/server'
import { appendToLog, gate, mockAdapter, text, wrapLogStore } from './helpers'
import type { Reply } from './helpers'
import type { SnapshotTiming } from '../src/log'

/**
 * Two server instances over the same stores, with no sticky routing: a run
 * that starts on host A must be joinable and resumable from host B. The two
 * log stores are two connections to one database.
 */
function twoHosts(options: { snapshot?: SnapshotTiming } = {}) {
  const logState = memoryLogState()
  const { metadata, sessions } = memoryPersistence().stores
  /** The `after` of each log read of host B. */
  const readsOfB: Array<number> = []
  const persistenceOf = (reads?: Array<number>) => {
    const inner = memoryLogStore({ state: logState })
    const log = reads
      ? wrapLogStore(inner, {
          read: (query) => {
            reads.push(query.after ?? 0)
            return inner.read(query)
          },
        })
      : inner
    return { stores: { log, metadata, sessions } }
  }
  const release = gate()
  // RUN_STARTED, then the rest after `release`. By RUN_STARTED, host A holds
  // the log, so host B only reads.
  const reply: Reply = () =>
    (async function* () {
      const [started, ...rest] = text('Hello from A.')
      if (started) yield started
      await release.opened
      yield* rest
    })()
  const { adapter, calls } = mockAdapter([reply])
  const harness = defineHarness({ name: 'test/run-hosts', adapter })
  const handlerOf = (reads?: Array<number>) => {
    const host = createHarnessHost({
      persistence: persistenceOf(reads),
      log: {
        bufferStreamWriteMs: 0,
        ...(options.snapshot ? { saveSnapshotAfter: options.snapshot } : {}),
      },
      access: {
        getUser: ({ request }) => ({
          id: request.headers.get('x-user') ?? 'user-1',
        }),
        // A user may use the threads whose id starts with the user id.
        rules: {
          isAllowed: ({ user, session }) =>
            session.threadId.startsWith(user.id),
        },
      },
    })
    const handler = createHarnessHandler({
      host,
      harness,
      media: { secret: 'a-shared-secret-of-32-bytes-or-more' },
    })
    const call = (path: string, init: RequestInit = {}) =>
      handler(new Request(`http://h.test/api/${path}`, init))
    return { host, call }
  }
  const a = handlerOf()
  const b = handlerOf(readsOfB)
  const post = (on: typeof a, headers: Record<string, string> = {}) =>
    on.call('run', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify({
        threadId: 'user-1-t',
        runId: 'run-a',
        messages: [{ id: 'm-1', role: 'user', content: 'Hi.' }],
        tools: [],
        context: [],
      }),
    })
  const close = () => Promise.all([a.host.close(), b.host.close()])
  return { a, b, post, release, calls, close, logState, readsOfB }
}

/** SSE events with their `id:` lines. */
const withIds = (body: string) =>
  body
    .split('\n\n')
    .filter((block) => block.includes('data: '))
    .map((block) => ({
      id: /^id: (.*)$/m.exec(block)?.[1],
      chunk: JSON.parse(/^data: (.*)$/m.exec(block)?.[1] ?? 'null') as {
        type: string
        name?: string
        delta?: string
      },
    }))

/** Read `response` until RUN_STARTED, then cancel it: a cut connection. */
async function readThenCut(response: Response) {
  const reader = response.body!.pipeThrough(new TextDecoderStream()).getReader()
  let body = ''
  while (!body.includes('RUN_STARTED') || !body.endsWith('\n\n')) {
    const { value, done } = await reader.read()
    if (done) break
    body += value
  }
  await reader.cancel()
  return withIds(body)
}

describe('a run on a durable host, across instances', () => {
  it('sends the log cursor as the id of each POST run event', async () => {
    const { a, post, release, close } = twoHosts()
    release.open()
    const events = withIds(await (await post(a)).text())
    expect(events.length).toBeGreaterThan(3)
    expect(events.every((event) => /^\d+$/.test(event.id ?? ''))).toBe(true)
    await close()
  })

  it('joins a run that host A runs from host B, live, from the start', async () => {
    const { a, b, post, release, close } = twoHosts()
    const started = await readThenCut(await post(a))
    expect(started.at(-1)?.chunk.type).toBe('RUN_STARTED')

    const joined = await b.call('run?runId=run-a&threadId=user-1-t&offset=-1')
    expect(joined.status).toBe(200)
    release.open()
    const events = withIds(await joined.text())
    // The same events, from the start of the turn, as host A sent.
    expect(events.slice(0, started.length)).toEqual(started)
    expect(events.some((event) => event.chunk.delta === 'Hello from A.')).toBe(
      true,
    )
    expect(events.at(-1)?.chunk.name).toBe('harness.operation.finished')
    expect(events.every((event) => event.id !== undefined)).toBe(true)
    await close()
  })

  it('reads the log on host B from the start of the run, not from the start of the log', async () => {
    const { a, b, post, release, close, logState, readsOfB } = twoHosts({
      // Host A writes a snapshot at each write, so host B folds from it.
      snapshot: { bytes: 1 },
    })
    // Records before the run, so the run does not start at the log start.
    const history = Array.from({ length: 20 }, (_, n) => ({
      type: 'app.history',
      n,
    }))
    await appendToLog(
      memoryLogStore({ state: logState }),
      { threadId: 'user-1-t' },
      history,
    )
    const started = await readThenCut(await post(a))
    expect(started.at(-1)?.chunk.type).toBe('RUN_STARTED')

    const joined = await b.call('run?runId=run-a&threadId=user-1-t&offset=-1')
    expect(joined.status).toBe(200)
    release.open()
    const events = withIds(await joined.text())
    expect(events.slice(0, started.length)).toEqual(started)
    expect(events.at(-1)?.chunk.name).toBe('harness.operation.finished')
    // No read of host B walks the history before the run.
    expect(readsOfB.length).toBeGreaterThan(0)
    expect(Math.min(...readsOfB)).toBeGreaterThanOrEqual(history.length)
    await close()
  })

  it('resumes a cut join on host B after Last-Event-ID, with no repeated event', async () => {
    const { a, b, post, release, close } = twoHosts()
    release.open()
    const all = withIds(await (await post(a)).text())
    const cut = all[1]?.id
    if (cut === undefined) throw new Error('Too few events.')

    const resumed = await b.call('run?runId=run-a&threadId=user-1-t', {
      headers: { 'Last-Event-ID': cut },
    })
    const got = withIds(await resumed.text())
    // Every event after the cut, once, to the end of the turn.
    expect(got.slice(0, all.length - 2)).toEqual(all.slice(2))
    expect(got.at(-1)?.chunk.name).toBe('harness.operation.finished')
    await close()
  })

  it('resumes a cut POST run on host B: the retry streams from Last-Event-ID and runs nothing again', async () => {
    const { a, b, post, release, calls, close } = twoHosts()
    const first = await readThenCut(await post(a))
    const cut = first.at(-1)?.id
    if (cut === undefined) throw new Error('No cursor on the first event.')

    // The client re-sends the same POST with the last cursor it saw.
    const retried = post(b, { 'Last-Event-ID': cut })
    release.open()
    const rest = withIds(await (await retried).text())
    expect(rest[0]?.chunk.type).not.toBe('RUN_STARTED')
    expect(rest.some((event) => event.chunk.delta === 'Hello from A.')).toBe(
      true,
    )
    expect(rest.at(-1)?.chunk.name).toBe('harness.operation.finished')
    expect(rest.every((event) => Number(event.id) > Number(cut))).toBe(true)
    expect(calls).toHaveLength(1)
    await close()
  })

  it('shows the run as activeRun on host B, so a reloaded client joins it', async () => {
    const { a, b, post, release, close } = twoHosts()
    const posted = await post(a)
    await readThenCut(posted)
    const hydrated = await (await b.call('run?threadId=user-1-t')).json()
    expect(hydrated.activeRun).toEqual({ runId: 'run-a' })
    release.open()
    await (await b.call('run?runId=run-a&threadId=user-1-t&offset=-1')).text()
    await close()
  })

  it('refuses a join on host B of a thread the user may not use, and 404s an unknown run', async () => {
    const { a, b, post, release, close } = twoHosts()
    await readThenCut(await post(a))
    const refused = await b.call('run?runId=run-a&threadId=user-1-t', {
      headers: { 'x-user': 'user-2' },
    })
    expect(refused.status).toBe(403)
    expect(
      (await b.call('run?runId=nope&threadId=user-1-t&offset=-1')).status,
    ).toBe(404)
    release.open()
    await (await b.call('run?runId=run-a&threadId=user-1-t&offset=-1')).text()
    await close()
  })
})
