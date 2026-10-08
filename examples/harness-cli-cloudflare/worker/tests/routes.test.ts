import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestHarness } from 'wrangler'

const SECRET = 'test-secret'
const server = createTestHarness({
  root: fileURLToPath(new URL('..', import.meta.url)),
  workers: [
    {
      configPath: 'wrangler.jsonc',
      secrets: { HARNESS_SECRET: SECRET, ENCRYPTION_KEY: 'test-key' },
    },
  ],
})
let base: URL
beforeAll(async () => {
  base = (await server.listen()).url
})
afterAll(() => server.close())

/** A request to the Worker, with the secret unless another one is given. */
function call(path: string, init: RequestInit = {}, secret = SECRET) {
  return fetch(new URL(path, base), {
    ...init,
    headers: { Authorization: `Bearer ${secret}`, ...init.headers },
  })
}

/** A JSON request to the Worker. */
const send = (path: string, method: string, body: unknown) =>
  call(path, {
    method,
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })

/** A transcript record with one user message, as the harness writes it. */
const userTurn = (content: string) => ({
  type: 'harness.transcript',
  keep: 0,
  add: [{ role: 'user', content }],
})

describe('the Worker', () => {
  it('refuses a request without the secret', async () => {
    expect((await call('/health', {}, '')).status).toBe(401)
    expect((await call('/health', {}, 'wrong')).status).toBe(401)
    expect(
      (await call('/code-mode', { method: 'POST', body: '{}' }, 'wrong'))
        .status,
    ).toBe(401)
    expect(await (await call('/health')).json()).toEqual({
      ok: true,
      name: 'tanstack-harness',
    })
  })

  it('appends in order, and refuses a position that is taken or skipped', async () => {
    const log = '/sessions/append-test/log'
    expect(
      (await send(log, 'POST', { seq: 1, records: ['a', 'b'] })).status,
    ).toBe(200)
    expect((await send(log, 'POST', { seq: 2, records: ['x'] })).status).toBe(
      409,
    )
    expect((await send(log, 'POST', { seq: 5, records: ['x'] })).status).toBe(
      409,
    )
    expect((await send(log, 'POST', { seq: 3, records: ['c'] })).status).toBe(
      200,
    )

    expect(await (await call(`${log}?after=0`)).json()).toEqual({
      entries: [
        { seq: 1, record: 'a' },
        { seq: 2, record: 'b' },
        { seq: 3, record: 'c' },
      ],
    })
    expect(await (await call(`${log}?after=1&limit=1`)).json()).toEqual({
      entries: [{ seq: 2, record: 'b' }],
    })
  })

  it('lists sessions by what the user said first, newest first', async () => {
    await send('/sessions/list-old/log', 'POST', {
      seq: 1,
      records: [userTurn('write the release notes')],
    })
    await send('/sessions/list-new/log', 'POST', {
      seq: 1,
      records: [userTurn('fix the  failing\ntest')],
    })
    await send('/sessions/list-new/log', 'POST', {
      seq: 2,
      records: [userTurn('and then lint')],
    })
    await send(
      `/sessions/${encodeURIComponent('list-new:codex')}/log`,
      'POST',
      {
        seq: 1,
        records: [userTurn('a child agent')],
      },
    )

    const { sessions } = await (await call('/sessions?limit=10')).json()
    const listed = sessions.filter((session: { id: string }) =>
      session.id.startsWith('list-'),
    )
    expect(
      listed.map((session: { id: string; title: string }) => [
        session.id,
        session.title,
      ]),
    ).toEqual([
      ['list-new', 'fix the failing test'],
      ['list-old', 'write the release notes'],
    ])
  })

  it('keeps a key and gives it back', async () => {
    const credential = { type: 'api_key', value: 'cf-token-123' }
    await send('/credentials/-%2F-/cloudflare', 'PUT', { credential })
    expect(await (await call('/credentials/-%2F-/cloudflare')).json()).toEqual({
      credential,
    })
    expect(await (await call('/credentials/-%2F-')).json()).toEqual({
      items: [{ id: 'cloudflare', type: 'api_key' }],
    })
    await call('/credentials/-%2F-/cloudflare', { method: 'DELETE' })
    expect(await (await call('/credentials/-%2F-/cloudflare')).json()).toEqual({
      credential: null,
    })
  })

  it('serves a slice of a blob, with the whole size', async () => {
    const put = await call('/blobs/media%2Fclip.txt', {
      method: 'PUT',
      body: '0123456789',
      headers: { 'Content-Type': 'text/plain' },
    })
    expect(await put.json()).toMatchObject({ key: 'media/clip.txt', size: 10 })

    const slice = await call('/blobs/media%2Fclip.txt?offset=2&length=3')
    expect(await slice.text()).toBe('234')
    expect(
      JSON.parse(slice.headers.get('x-blob-record') ?? '{}'),
    ).toMatchObject({
      size: 10,
      contentType: 'text/plain',
    })
    expect(JSON.parse(slice.headers.get('x-blob-range') ?? '{}')).toEqual({
      offset: 2,
      length: 3,
    })
  })
})
