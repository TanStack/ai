import { describe, expect, it, vi } from 'vitest'
import { SecureMcpError } from '../src/types'
import { createEgress } from '../src/egress'

describe('createEgress', () => {
  it('allows a listed origin and passes the HTTP status through', async () => {
    const fetchImpl = vi.fn(
      async (_url: string, _init?: RequestInit) =>
        new Response('body', { status: 404 }),
    )
    const egress = createEgress({
      allow: ['https://api.hue.local'],
      fetch: fetchImpl,
    })
    const res = await egress('https://api.hue.local/lights')
    expect(res.status).toBe(404)
    // redirect is forced to error, not followed.
    expect(fetchImpl.mock.calls[0]![1]?.redirect).toBe('error')
  })

  it('refuses an off-list origin with egress_denied and reports it', async () => {
    const onDenied = vi.fn()
    const egress = createEgress({
      allow: ['https://api.hue.local'],
      onDenied,
      fetch: async () => new Response('should not run'),
    })
    await expect(egress('https://evil.test/steal')).rejects.toMatchObject({
      code: 'egress_denied',
    })
    expect(onDenied).toHaveBeenCalledWith('https://evil.test')
  })

  it('maps a network failure to backend_unavailable', async () => {
    const egress = createEgress({
      allow: ['https://api.hue.local'],
      fetch: async () => {
        throw new Error('ECONNREFUSED')
      },
    })
    await expect(egress('https://api.hue.local/x')).rejects.toMatchObject({
      code: 'backend_unavailable',
    })
  })

  it('rejects a non-URL allowlist entry at build time', () => {
    expect(() => createEgress({ allow: ['not a url'] })).toThrow(SecureMcpError)
  })

  it('honors a caller signal that is already aborted', async () => {
    const fetchImpl = vi.fn(async () => new Response('body'))
    const egress = createEgress({
      allow: ['https://api.hue.local'],
      fetch: fetchImpl,
    })
    await expect(
      egress('https://api.hue.local/x', { signal: AbortSignal.abort() }),
    ).rejects.toMatchObject({ code: 'backend_unavailable' })
    // The request never went out, because the caller had already cancelled.
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('passes a combined signal to fetch so caller cancellation reaches it', async () => {
    let seen: AbortSignal | undefined
    const egress = createEgress({
      allow: ['https://api.hue.local'],
      fetch: async (_url, init) => {
        seen = init?.signal ?? undefined
        return new Response('body')
      },
    })
    const controller = new AbortController()
    await egress('https://api.hue.local/x', { signal: controller.signal })
    expect(seen).toBeInstanceOf(AbortSignal)
    expect(seen?.aborted).toBe(false)
    // A later caller abort propagates to the signal fetch received.
    controller.abort()
    expect(seen?.aborted).toBe(true)
  })

  it('unrefs the deadline timer so a completed request does not hold the loop', async () => {
    // Spy on the timer's own `unref` before `createEgress` can call it, so the
    // test fails if `timer.unref?.()` is dropped from the source. Wrapping
    // `setTimeout` lets us attach the spy to the real timer it returns.
    const realSetTimeout = global.setTimeout
    const unrefSpy = vi.fn()
    const spy = vi
      .spyOn(global, 'setTimeout')
      .mockImplementation(((...args: Parameters<typeof setTimeout>) => {
        const timer = realSetTimeout(...args)
        const original = (timer as { unref?: () => unknown }).unref
        ;(timer as { unref?: () => unknown }).unref = function unref() {
          unrefSpy()
          return original?.call(this)
        }
        return timer
      }) as typeof setTimeout)
    const egress = createEgress({
      allow: ['https://api.hue.local'],
      fetch: async () => new Response('body'),
    })
    await egress('https://api.hue.local/x')
    // The deadline timer must be unref'd so a finished request cannot delay
    // process exit by the remaining timeout.
    expect(unrefSpy).toHaveBeenCalledTimes(1)
    spy.mockRestore()
  })

  it('maps a body-read transport failure to backend_unavailable', async () => {
    // Headers arrive, but reading the body rejects (a stalled body the deadline
    // aborts behaves this way). The error must keep the documented taxonomy.
    const egress = createEgress({
      allow: ['https://api.hue.local'],
      fetch: async () => {
        const res = new Response('ok')
        res.text = async () => {
          throw new Error('aborted')
        }
        return res
      },
    })
    const res = await egress('https://api.hue.local/x')
    expect(res.status).toBe(200)
    await expect(res.text()).rejects.toMatchObject({
      code: 'backend_unavailable',
    })
  })

  it('leaves status, headers, and streaming body on the wrapped response', async () => {
    const egress = createEgress({
      allow: ['https://api.hue.local'],
      fetch: async () =>
        new Response('hello', {
          status: 201,
          headers: { 'x-test': 'yes' },
        }),
    })
    const res = await egress('https://api.hue.local/x')
    expect(res.status).toBe(201)
    expect(res.headers.get('x-test')).toBe('yes')
    expect(res.body).toBeInstanceOf(ReadableStream)
    expect(await res.text()).toBe('hello')
  })
})
