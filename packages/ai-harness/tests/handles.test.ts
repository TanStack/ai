import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  LogConflictError,
  memoryLogStore,
  memoryPersistence,
} from '@tanstack/ai-persistence'
import { createHarnessHost, defineHarness } from '../src'
import { createHarnessHandler } from '../src/server'
import { hostCountsOf } from '../src/host'
import { finalizeHandle } from '../src/session/handle'
import { mockAdapter, readSse, text, wrapLogStore } from './helpers'
import type { HostLifecycleOptions } from '../src'

/**
 * `vi.waitFor` with more time: CI runs these tests slower, for example under
 * coverage, and a poll costs nothing when the check passes early.
 */
const waitFor = <T>(check: () => T | Promise<T>) =>
  vi.waitFor(check, { timeout: 5_000 })

const BASE = 'http://x/api/harness'

/** A memory host with `lifecycle`, and a harness that answers each turn. */
function setup(lifecycle: HostLifecycleOptions = {}) {
  const { adapter, calls } = mockAdapter(() => text('Hello back.'))
  const harness = defineHarness({ name: 'test/handles', adapter })
  const host = createHarnessHost({
    persistence: memoryPersistence(),
    lifecycle,
  })
  const isOpen = (threadId: string) => host.isOpen(harness, { threadId })
  const open = (threadId: string) => host.open(harness, { threadId })
  return { host, harness, calls, isOpen, open }
}

/** The warnings of dropped handles that `console.warn` got. */
function droppedWarnings() {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  return () =>
    warn.mock.calls.filter(([message]) =>
      String(message).includes('dropped without close()'),
    )
}

/** The warnings of a host past `maxOpenSessions` that `console.warn` got. */
function fullWarnings() {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  return () =>
    warn.mock.calls.filter(([message]) =>
      String(message).includes('lifecycle.maxOpenSessions'),
    )
}

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('handle.close', () => {
  it('keeps the session open while another handle holds it, and closes it with the last handle', async () => {
    const { host, isOpen, open } = setup({ closeIdleSessionsAfterMs: 0 })
    const first = await open('t1')
    const second = await open('t1')

    await first.close()
    // A second close of the same handle does not release the other one.
    await first.close()
    expect(isOpen('t1')).toBe(true)

    await second.close()
    expect(isOpen('t1')).toBe(false)
    expect(hostCountsOf(host)).toMatchObject({ sessions: 0, handles: 0 })
    await host.close()
  })

  it('releases the handle with await using', async () => {
    const { host, isOpen, open } = setup({ closeIdleSessionsAfterMs: 0 })
    {
      await using session = await open('t1')
      await session.send('Hello.')
      expect(isOpen('t1')).toBe(true)
    }
    expect(isOpen('t1')).toBe(false)
    await host.close()
  })
})

describe('the idle close', () => {
  it('closes a session that no handle holds after closeIdleSessionsAfterMs', async () => {
    const { host, isOpen, open } = setup({ closeIdleSessionsAfterMs: 1000 })
    const session = await open('t1')
    vi.useFakeTimers()

    await session.close()
    await vi.advanceTimersByTimeAsync(999)
    expect(isOpen('t1')).toBe(true)
    await vi.advanceTimersByTimeAsync(1)
    expect(isOpen('t1')).toBe(false)
    await host.close()
  })

  it('stops the wait when a new handle opens', async () => {
    const { host, isOpen, open } = setup({ closeIdleSessionsAfterMs: 1000 })
    const first = await open('t1')
    vi.useFakeTimers()
    await first.close()
    await vi.advanceTimersByTimeAsync(500)

    const second = await open('t1')
    await vi.advanceTimersByTimeAsync(2000)
    expect(isOpen('t1')).toBe(true)

    await second.close()
    await vi.advanceTimersByTimeAsync(1000)
    expect(isOpen('t1')).toBe(false)
    await host.close()
  })
})

describe('a dropped handle', () => {
  it('is released when the garbage collector drops it, with one warning per session', async () => {
    const warnings = droppedWarnings()
    const { host, isOpen, open } = setup({ closeIdleSessionsAfterMs: 0 })
    const first = await open('t1')
    const second = await open('t1')

    finalizeHandle(first)
    expect(isOpen('t1')).toBe(true)
    finalizeHandle(second)

    expect(isOpen('t1')).toBe(false)
    expect(warnings()).toHaveLength(1)
    expect(String(warnings()[0]?.[0])).toContain('"t1"')
    await host.close()
  })

  it('gives no warning and no second release after close()', async () => {
    const warnings = droppedWarnings()
    const { host, isOpen, open } = setup({ closeIdleSessionsAfterMs: 0 })
    const closed = await open('t1')
    const held = await open('t1')

    await closed.close()
    finalizeHandle(closed)

    expect(isOpen('t1')).toBe(true)
    expect(warnings()).toHaveLength(0)
    await held.close()
    await host.close()
  })

  it('gives no warning after host.close(), which closed its session', async () => {
    const warnings = droppedWarnings()
    const { host, open } = setup({ closeIdleSessionsAfterMs: 0 })
    const session = await open('t1')
    await session.send('Hello.')

    await host.close()
    finalizeHandle(session)

    expect(warnings()).toHaveLength(0)
  })
})

describe('a call after handle.close', () => {
  it('throws, and a new host.open works', async () => {
    const { host, isOpen, open } = setup({ closeIdleSessionsAfterMs: 0 })
    const session = await open('t1')
    await session.close()
    expect(isOpen('t1')).toBe(false)

    const closed = 'This handle is closed. Call host.open again.'
    expect(() => session.send('Hello.')).toThrow(closed)
    expect(() => session.transcript()).toThrow(closed)
    expect(() => session.events()).toThrow(closed)
    expect(() => session.snapshot()).toThrow(closed)
    // A second close still does nothing.
    await session.close()
    expect(isOpen('t1')).toBe(false)

    const next = await open('t1')
    expect((await next.send('Hello.')).text).toBe('Hello back.')
    await next.close()
    await host.close()
  })
})

describe('a live handle whose session closed under it', () => {
  it('opens the session again, and the turn runs', async () => {
    const inner = memoryLogStore()
    // While `isBroken`, the store refuses each append, as when another host
    // took the log: the session stops.
    let isBroken = false
    const log = wrapLogStore(inner, {
      append: (batch) =>
        isBroken
          ? Promise.reject(new LogConflictError(batch.logId, batch.seq))
          : inner.append(batch),
    })
    const { adapter, calls } = mockAdapter(() => text('Hello back.'))
    const harness = defineHarness({ name: 'test/handles', adapter })
    const host = createHarnessHost({ persistence: { stores: { log } } })
    const session = await host.open(harness, { threadId: 't1' })
    isBroken = true
    await Promise.resolve(session.send('Lost.')).catch(() => {})
    await waitFor(() =>
      expect(host.isOpen(harness, { threadId: 't1' })).toBe(false),
    )
    isBroken = false

    const turn = session.send('Hello.')
    // The operation exists once the session opened again.
    expect(() => turn.id).toThrow('Await operation.receipt')
    expect((await turn.receipt).status).toBe('accepted')
    expect((await turn).text).toBe('Hello back.')
    expect(calls.length).toBeGreaterThan(0)
    expect(host.isOpen(harness, { threadId: 't1' })).toBe(true)
    await session.close()
    await host.close()
  })
})

describe('maxOpenSessions', () => {
  it('closes the least recently used idle session that no handle holds', async () => {
    const { host, isOpen, open } = setup({ maxOpenSessions: 2 })
    await (await open('a')).close()
    await (await open('b')).close()
    // `a` is used again, so `b` is the least recently used.
    await (await open('a')).close()

    const c = await open('c')

    expect(isOpen('a')).toBe(true)
    expect(isOpen('b')).toBe(false)
    expect(isOpen('c')).toBe(true)
    await c.close()
    await host.close()
  })

  it('opens past the limit with one warning when every session is held', async () => {
    const warnings = fullWarnings()
    const { host, isOpen, open } = setup({ maxOpenSessions: 1 })
    const held = [await open('a')]

    held.push(await open('b'), await open('c'))

    expect(['a', 'b', 'c'].map(isOpen)).toEqual([true, true, true])
    expect(warnings()).toHaveLength(1)
    await Promise.all(held.map((session) => session.close()))
    await host.close()
  })
})

describe('host.close', () => {
  it('refuses later opens and the calls of open handles', async () => {
    const { host, harness, open } = setup()
    const session = await open('t1')

    await host.close()

    await expect(host.open(harness, { threadId: 't2' })).rejects.toThrow(
      'The host is closed.',
    )
    expect(() => session.send('Hello.')).toThrow('The host is closed.')
    await expect(session.transcript()).rejects.toThrow('The host is closed.')
  })
})

describe('the HTTP handler', () => {
  it('releases the handles of 10 000 reads, so no session stays open', async () => {
    const { host, harness } = setup({ closeIdleSessionsAfterMs: 0 })
    const handler = createHarnessHandler({ host, harness, openAccess: true })
    const statuses = new Set<number>()

    for (let index = 0; index < 10_000; index += 1) {
      const response = await handler(
        new Request(`${BASE}/snapshot?threadId=t-${index}`),
      )
      statuses.add(response.status)
    }

    expect([...statuses]).toEqual([200])
    await waitFor(() =>
      expect(hostCountsOf(host)).toEqual({
        sessions: 0,
        handles: 0,
        holds: 0,
        statuses: 0,
        closing: 0,
        children: 0,
      }),
    )
    await host.close()
  }, 60_000)

  it('holds no handle for an event stream, so the session still closes on idle', async () => {
    const { host, harness, isOpen, open } = setup({
      closeIdleSessionsAfterMs: 0,
    })
    const handler = createHarnessHandler({ host, harness, openAccess: true })
    const session = await open('t1')
    await session.send('Hello.')
    const response = await handler(new Request(`${BASE}/events?threadId=t1`))
    // Only the handle of `open`.
    expect(hostCountsOf(host).handles).toBe(1)

    await session.close()

    expect(isOpen('t1')).toBe(false)
    expect(hostCountsOf(host).handles).toBe(0)
    // The stream reads the log, so it still has the turn after the close.
    const frames = await readSse<unknown>(response, (frame) =>
      JSON.stringify(frame).includes('Hello back.'),
    )
    expect(JSON.stringify(frames)).toContain('Hello back.')
    await host.close()
  })

  it('releases the handle of a run stream when the turn ends', async () => {
    const { host, harness, isOpen } = setup({ closeIdleSessionsAfterMs: 0 })
    const handler = createHarnessHandler({ host, harness, openAccess: true })
    const response = await handler(
      new Request(`${BASE}/run`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          threadId: 't1',
          runId: 'run-1',
          messages: [{ id: 'u1', role: 'user', content: 'Hello.' }],
          tools: [],
          context: [],
        }),
      }),
    )

    expect(await response.text()).toContain('Hello back.')
    await waitFor(() => expect(isOpen('t1')).toBe(false))
    await host.close()
  })
})
