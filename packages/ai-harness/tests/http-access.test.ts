import { describe, expect, it, vi } from 'vitest'
import { memoryPersistence } from '@tanstack/ai-persistence'
import { createHarnessHost, defineHarness, membersOnly } from '../src'
import { createHarnessHandler, handleHarnessSocket } from '../src/server'
import { createHarnessClient } from '../src/client'
import { isMediaRecord } from '../src/media-entry'
import { fakeSocket, mockAdapter, readSse, text } from './helpers'
import type { HostEvent } from '../src'

// Coverage runs in CI are slow, so polled checks wait up to 5 s.
const waitFor = <T>(
  check: () => T | Promise<T>,
  options?: { timeout?: number; interval?: number },
) => vi.waitFor(check, { timeout: 5_000, ...options })

const BASE = 'http://x/api/harness'

const olga = { id: 'olga', tenantId: 'acme' }
const bea = { id: 'bea', tenantId: 'acme' }
const cid = { id: 'cid', tenantId: 'acme' }
const gus = { id: 'gus', tenantId: 'globex' }
const users = new Map([olga, bea, cid, gus].map((user) => [user.id, user]))

/** A request of the user named by the `x-user` header. */
const requestAs = (userId: string, path = 'socket', init: RequestInit = {}) =>
  new Request(`${BASE}/${path}`, {
    ...init,
    headers: {
      'x-user': userId,
      'content-type': 'application/json',
      ...init.headers,
    },
  })

/** A membersOnly() host whose users come from the `x-user` header. */
function setup() {
  const harness = defineHarness({
    name: 'test/http-access',
    adapter: mockAdapter(() => text('ok')).adapter,
  })
  const persistence = memoryPersistence()
  const host = createHarnessHost({
    persistence,
    access: {
      getUser: ({ request }) =>
        users.get(request.headers.get('x-user') ?? '') ?? null,
      rules: membersOnly(),
    },
  })
  const handler = createHarnessHandler({ host, harness })
  const call = (userId: string, path: string, init?: RequestInit) =>
    handler(requestAs(userId, path, init))
  const prompt = (userId: string, threadId: string) =>
    call(userId, 'control', {
      method: 'POST',
      body: JSON.stringify({
        threadId,
        input: { op: 'prompt', message: 'Hi.' },
      }),
    })
  const share = (userId: string, role: 'member' | 'viewer') =>
    host.sessions.share({ threadId: 't1', userId, role, user: olga })
  return { host, harness, handler, call, prompt, share, persistence }
}

/** The thread of a host event, from its own field or its entry. */
const threadOf = (event: HostEvent) =>
  event.type === 'session' || event.type === 'session-deleted'
    ? event.entry.threadId
    : event.type === 'transferred'
      ? event.to.threadId
      : event.threadId

describe('handlers and sockets fail closed', () => {
  it('throws at the start for a host without access and without openAccess', () => {
    const host = createHarnessHost({ persistence: memoryPersistence() })
    const harness = defineHarness({ name: 'test/open' })

    expect(() => createHarnessHandler({ host, harness })).toThrow(
      'createHarnessHandler needs host access ({ getUser, rules }) or openAccess: true',
    )
    expect(() =>
      handleHarnessSocket({
        host,
        harness,
        socket: fakeSocket().socket,
        request: requestAs('olga'),
      }),
    ).toThrow(
      'handleHarnessSocket needs host access ({ getUser, rules }) or openAccess: true',
    )
  })

  it('throws at the start for openAccess on a host with access', async () => {
    const { host, harness } = setup()

    expect(() =>
      createHarnessHandler({ host, harness, openAccess: true }),
    ).toThrow(
      'createHarnessHandler: the host has access, so access.getUser reads the user of each request. Remove openAccess.',
    )
    expect(() =>
      handleHarnessSocket({
        host,
        harness,
        socket: fakeSocket().socket,
        request: requestAs('olga'),
        openAccess: { user: olga },
      }),
    ).toThrow('handleHarnessSocket: the host has access')
    await host.close()
  })
})

describe('the handler on a host with access', () => {
  it('refuses a stranger with 403, and a read of a missing thread is 404 and starts nothing', async () => {
    const { host, call, prompt } = setup()
    expect((await prompt('olga', 't1')).status).toBe(200)

    expect((await call('cid', 'transcript?threadId=t1')).status).toBe(403)
    expect((await prompt('cid', 't1')).status).toBe(403)
    expect((await call('nobody', 'transcript?threadId=t1')).status).toBe(401)
    expect((await call('cid', 'events?threadId=t-none')).status).toBe(404)
    expect((await call('cid', 'snapshot?threadId=t-none')).status).toBe(404)
    expect(
      await host.sessions.get({ threadId: 't-none', user: cid }),
    ).toBeUndefined()
    await host.close()
  })

  it('shares and unshares a thread through POST sessions', async () => {
    const { host, call, prompt } = setup()
    await prompt('olga', 't1')
    const sessionsOp = (userId: string, body: object) =>
      call(userId, 'sessions', { method: 'POST', body: JSON.stringify(body) })

    const shared = await sessionsOp('olga', {
      op: 'share',
      threadId: 't1',
      userId: 'bea',
      role: 'viewer',
    })
    expect((await shared.json()).members).toEqual([
      { userId: 'olga', role: 'owner' },
      { userId: 'bea', role: 'viewer' },
    ])
    expect((await call('bea', 'transcript?threadId=t1')).status).toBe(200)
    expect((await prompt('bea', 't1')).status).toBe(403)
    expect(
      (
        await sessionsOp('bea', {
          op: 'share',
          threadId: 't1',
          userId: 'cid',
          role: 'member',
        })
      ).status,
    ).toBe(403)

    await sessionsOp('olga', { op: 'unshare', threadId: 't1', userId: 'bea' })

    expect((await call('bea', 'transcript?threadId=t1')).status).toBe(403)
    await host.close()
  })

  it('refuses a signed media URL after unshare removed its user', async () => {
    const { host, handler, call, prompt, share } = setup()
    await prompt('olga', 't1')
    const uploaded = await call('olga', 'media?threadId=t1&name=cat.png', {
      method: 'POST',
      body: 'hello',
      headers: { 'content-type': 'image/png' },
    })
    const record: unknown = await uploaded.json()
    if (!isMediaRecord(record)) throw new Error('The upload failed.')
    await share('bea', 'viewer')
    const signed = await call('bea', `media-url?threadId=t1&id=${record.id}`)
    const { path }: { path: string } = await signed.json()
    const fetchSigned = () => handler(requestAs('bea', path))
    expect(await (await fetchSigned()).text()).toBe('hello')

    await host.sessions.unshare({
      threadId: 't1',
      userId: 'bea',
      user: olga,
    })

    expect((await fetchSigned()).status).toBe(403)
    await host.close()
  })

  it('closes the open events stream of a user on revoke', async () => {
    const { host, call, prompt, share } = setup()
    await prompt('olga', 't1')
    await share('bea', 'member')
    const response = await call('bea', 'events?threadId=t1')
    const reading = readSse(response, () => false)

    host.revoke({ threadId: 't1', user: bea })

    // The read ends only when the stream closes.
    await expect(reading).resolves.toBeInstanceOf(Array)
    await host.close()
  })

  it('watches revokes on the bus of the tenant, not on the every-tenant host.events()', async () => {
    const { host, call, prompt, share } = setup()
    await prompt('olga', 't1')
    await share('bea', 'member')
    // The every-tenant reader starts with all statuses and gets every event
    // of every tenant, so a watch of each stream must not use it.
    const everyTenant = vi.spyOn(host, 'events')
    const response = await call('bea', 'events?threadId=t1')
    const reading = readSse(response, () => false)

    host.revoke({ threadId: 't1', user: bea })

    await expect(reading).resolves.toBeInstanceOf(Array)
    expect(everyTenant).not.toHaveBeenCalled()
    await host.close()
  })

  it('reads the access of a readable thread once, not on each index change', async () => {
    const { host, call, prompt } = setup()
    await prompt('olga', 't1')
    const get = vi.spyOn(host.sessions, 'get')
    const renames: Array<Promise<unknown>> = []
    const reading = readSse(
      await call('olga', 'host-events'),
      (frame: { type: string } | HostEvent) => {
        // The hello: the stream reads the bus now.
        if (frame.type === 'harness.hello') {
          for (const title of ['a', 'b', 'c']) {
            renames.push(
              host.sessions.rename({ threadId: 't1', title, user: olga }),
            )
          }
        }
        return 'entry' in frame && frame.entry.title === 'c'
      },
    )

    await reading
    await Promise.all(renames)
    const reads = get.mock.calls.filter(([read]) => read.threadId === 't1')
    expect(reads).toHaveLength(1)
    await host.close()
  })

  it('forgets the reads of child threads in host-events when the user is revoked', async () => {
    const { host, call, prompt, share, persistence } = setup()
    await prompt('olga', 't1')
    await prompt('bea', 'b1')
    await share('bea', 'member')
    await persistence.stores.sessions?.upsert({
      tenantId: 'acme',
      threadId: 'subagent:c1',
      parentThreadId: 't1',
      members: [],
      createdAt: 1,
      updatedAt: 1,
    })
    const rename = (threadId: string, title: string, user = olga) =>
      host.sessions.rename({ threadId, title, user })
    const steps: Array<Promise<unknown>> = []
    const titleOf = (frame: { type: string } | HostEvent) =>
      'entry' in frame ? frame.entry.title : undefined

    const frames = await readSse(
      await call('bea', 'host-events'),
      (frame: { type: string } | HostEvent) => {
        if (frame.type === 'harness.hello') {
          steps.push(rename('subagent:c1', 'before'))
        }
        // The child was readable. Now the owner takes the access of bea.
        if (titleOf(frame) === 'before') {
          steps.push(
            (async () => {
              await host.sessions.unshare({
                threadId: 't1',
                userId: 'bea',
                user: olga,
              })
              await rename('subagent:c1', 'after')
              await rename('b1', 'end', bea)
            })(),
          )
        }
        return titleOf(frame) === 'end'
      },
    )

    await Promise.all(steps)
    const titles = frames.map(titleOf)
    expect(titles).toContain('before')
    expect(titles).not.toContain('after')
    await host.close()
  })

  it('never shows the threads of another tenant in host-events', async () => {
    const { host, call, prompt } = setup()
    const reading = readSse(
      await call('gus', 'host-events'),
      (event: HostEvent) => threadOf(event) === 'g1',
    )

    await prompt('olga', 't1')
    await prompt('gus', 'g1')

    const seen = (await reading).map(threadOf)
    expect(seen).toContain('g1')
    expect(seen).not.toContain('t1')
    await host.close()
  })
})

describe('a new thread and a deleted thread', () => {
  it('lets the client stream the events of a new thread before its first message', async () => {
    const { handler, prompt } = setup()
    const client = createHarnessClient({
      url: BASE,
      threadId: 't-new',
      reconnectDelayMs: 5,
      headers: { 'x-user': 'olga' },
      fetch: (input, init) => handler(new Request(input, init)),
    })
    const reading = new AbortController()
    const first = (async () => {
      for await (const entry of client.events({ signal: reading.signal })) {
        return entry
      }
      return undefined
    })()
    // The thread has no entry yet, so the first reads answer 404.
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect((await prompt('olga', 't-new')).status).toBe(200)

    expect(await first).toBeDefined()
    reading.abort()
  })

  it('refuses POST sessions delete of a stranger, and of a thread with no entry', async () => {
    const { host, call, prompt } = setup()
    await prompt('olga', 't1')
    const remove = (userId: string, threadId: string) =>
      call(userId, 'sessions', {
        method: 'POST',
        body: JSON.stringify({ op: 'delete', threadId }),
      })

    expect((await remove('cid', 't1')).status).toBe(403)
    expect((await remove('cid', 't-none')).status).toBe(404)
    expect(
      await host.sessions.get({ threadId: 't1', user: olga }),
    ).toBeDefined()
    expect((await remove('olga', 't1')).status).toBe(204)
    await host.close()
  })

  it('deletes the transcript with the entry, so the next opener reads nothing', async () => {
    const { host, harness } = setup()
    const session = await host.open(harness, {
      threadId: 't1',
      user: olga,
    })
    await session.send('A secret.')
    expect(await session.transcript()).not.toEqual([])

    await host.sessions.delete({ threadId: 't1', user: olga })

    const reopened = await host.open(harness, {
      threadId: 't1',
      user: bea,
    })
    expect(await reopened.transcript()).toEqual([])
    await host.close()
  })
})

describe('the socket on a host with access', () => {
  it('refuses a request that getUser refuses, and a stranger to a thread', async () => {
    const { host, harness, prompt } = setup()
    await prompt('olga', 't1')
    const nobody = fakeSocket()
    const stranger = fakeSocket()
    handleHarnessSocket({
      host,
      harness,
      socket: nobody.socket,
      request: requestAs('nobody'),
    })
    handleHarnessSocket({
      host,
      harness,
      socket: stranger.socket,
      request: requestAs('cid'),
    })

    nobody.receive({ type: 'harness.subscribe', threadId: 't1' })
    stranger.receive({ type: 'harness.subscribe', threadId: 't1' })

    await waitFor(() => expect(nobody.closed).toEqual([4401]))
    expect(nobody.sent).toEqual([
      {
        type: 'harness.error',
        message: 'unauthorized',
        code: 'unauthorized',
        requestId: expect.any(String),
      },
    ])
    await waitFor(() => expect(stranger.closed).toEqual([4403]))
    expect(stranger.sent).toEqual([
      {
        type: 'harness.error',
        message: 'forbidden',
        code: 'forbidden',
        requestId: expect.any(String),
      },
    ])
    await host.close()
  })

  it('sends forbidden and closes when the user is revoked', async () => {
    const { host, harness, prompt, share } = setup()
    await prompt('olga', 't1')
    await share('bea', 'member')
    const { socket, sent, closed, receive } = fakeSocket()
    handleHarnessSocket({ host, harness, socket, request: requestAs('bea') })
    receive({ type: 'harness.subscribe', threadId: 't1' })
    await waitFor(() =>
      expect(sent.some((frame) => frame.type === 'harness.hello')).toBe(true),
    )

    host.revoke({ threadId: 't1', user: bea })

    await waitFor(() => expect(closed).toEqual([4403]))
    expect(sent.at(-1)).toEqual({
      type: 'harness.error',
      message: 'forbidden',
      code: 'forbidden',
      requestId: expect.any(String),
    })
    await host.close()
  })
})
