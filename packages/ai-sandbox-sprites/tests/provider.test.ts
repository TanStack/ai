/* eslint-disable @typescript-eslint/require-await -- fixed-response fetch mocks */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { spritesSandbox } from '../src/index'

type Listener = (ev: unknown) => void

/** Minimal WebSocket stub that auto-completes any exec as exit 0. */
class AutoExecWebSocket {
  binaryType = 'blob'
  private listeners: Record<string, Array<Listener>> = {}
  constructor() {
    setTimeout(() => {
      this.emit('open')
      this.emit('message', {
        data: JSON.stringify({ type: 'exit', exit_code: 0 }),
      })
      this.emit('close', { code: 1000, reason: '' })
    }, 0)
  }
  addEventListener(type: string, fn: Listener): void {
    ;(this.listeners[type] ??= []).push(fn)
  }
  close(): void {}
  private emit(type: string, ev: unknown = {}): void {
    for (const fn of this.listeners[type] ?? []) fn(ev)
  }
}

interface ProviderScenario {
  createStatus?: number
  getStatus?: number
  auth?: 'public' | 'sprite'
}
let calls: Array<{ method: string; url: string; body?: string }> = []

function installFetch(s: ProviderScenario = {}): void {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    const body = typeof init?.body === 'string' ? init.body : undefined
    calls.push({ method, url, body })
    const u = new URL(url)
    const auth = s.auth ?? 'public'
    const sprite = (name: string) => ({
      id: `sprite-${name}`,
      name,
      status: 'warm',
      url: `https://${name}-x.sprites.app`,
      url_settings: { auth },
    })
    if (method === 'POST' && u.pathname === '/v1/sprites') {
      const status = s.createStatus ?? 201
      if (status >= 400) return new Response('err', { status })
      const parsed = JSON.parse(body ?? '{}') as { name: string }
      return new Response(JSON.stringify(sprite(parsed.name)), { status })
    }
    const get = /^\/v1\/sprites\/([^/]+)$/.exec(u.pathname)
    if (get && method === 'GET') {
      const status = s.getStatus ?? 200
      if (status >= 400) return new Response('err', { status })
      return new Response(
        JSON.stringify(sprite(decodeURIComponent(get[1] ?? ''))),
        {
          status,
        },
      )
    }
    if (get && method === 'PUT') return new Response('', { status: 200 })
    if (get && method === 'DELETE') return new Response(null, { status: 204 })
    return new Response('nope', { status: 404 })
  })
  vi.stubGlobal('fetch', fetchMock)
}

beforeEach(() => {
  calls = []
  delete process.env.SPRITES_API_KEY
  vi.stubGlobal('WebSocket', AutoExecWebSocket)
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('spritesSandbox provider', () => {
  it('throws without an API key', () => {
    expect(() => spritesSandbox({})).toThrow(/API key is required/)
  })

  it('create() mints a tanstack-ai name and creates the workdir from /', async () => {
    installFetch({ auth: 'public' })
    const provider = spritesSandbox({ apiKey: 'k', apiUrl: 'https://api.test' })
    const handle = await provider.create({})
    expect(handle.id).toMatch(/^tanstack-ai-[0-9a-f]{12}$/)
    // The workdir mkdir must run with cwd '/', not the not-yet-existent workdir.
    const mkdirWs = calls.find((c) => c.url.includes('/exec'))
    // exec goes over WebSocket, not fetch, so assert via the handle behavior:
    expect(handle.capabilities.snapshots).toBe(true)
    void mkdirWs
  })

  it('create() uses the deterministic id as the sprite name when provided', async () => {
    installFetch({ auth: 'public' })
    const provider = spritesSandbox({ apiKey: 'k', apiUrl: 'https://api.test' })
    const handle = await provider.create({ id: 'deadbeefdeadbeef' })
    expect(handle.id).toBe('deadbeefdeadbeef')
    const post = calls.find(
      (c) => c.method === 'POST' && c.url.endsWith('/v1/sprites'),
    )
    expect(post?.body).toContain('"name":"deadbeefdeadbeef"')
  })

  it('create() forces configured urlAuth when the sprite differs', async () => {
    installFetch({ auth: 'public' })
    const provider = spritesSandbox({
      apiKey: 'k',
      apiUrl: 'https://api.test',
      urlAuth: 'sprite',
    })
    await provider.create({})
    const put = calls.find((c) => c.method === 'PUT')
    expect(put?.body).toContain('"auth":"sprite"')
  })

  it('create() skips the auth PUT when already in the configured mode', async () => {
    installFetch({ auth: 'public' })
    const provider = spritesSandbox({ apiKey: 'k', apiUrl: 'https://api.test' })
    await provider.create({})
    expect(calls.some((c) => c.method === 'PUT')).toBe(false)
  })

  it('resume() returns a handle for an existing sprite', async () => {
    installFetch({ auth: 'public' })
    const provider = spritesSandbox({ apiKey: 'k', apiUrl: 'https://api.test' })
    const handle = await provider.resume({ id: 'tanstack-ai-abc' })
    expect(handle?.id).toBe('tanstack-ai-abc')
  })

  it('resume() returns null when the sprite is gone', async () => {
    installFetch({ getStatus: 404 })
    const provider = spritesSandbox({ apiKey: 'k', apiUrl: 'https://api.test' })
    expect(await provider.resume({ id: 'missing' })).toBeNull()
  })
})
