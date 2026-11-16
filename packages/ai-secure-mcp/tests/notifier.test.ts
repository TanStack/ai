import { describe, expect, it, vi } from 'vitest'
import {
  debounceNotifier,
  describeEvent,
  ntfyNotifier,
  silentNotifier,
} from '../src/notifier'
import type { SecurityEvent, SecurityNotifier } from '../src/types'

describe('describeEvent', () => {
  it('summarizes without leaking structure', () => {
    expect(describeEvent({ kind: 'rate_limited', client: 'bob' })).toContain(
      'bob',
    )
    expect(
      describeEvent({ kind: 'egress_denied', origin: 'evil.test' }),
    ).toContain('evil.test')
  })
})

describe('ntfyNotifier', () => {
  it('posts the summary to the topic and never throws on failure', async () => {
    const fetchImpl = vi.fn(
      async (_url: string, _init?: RequestInit) => new Response('ok'),
    )
    const n = ntfyNotifier({ topic: 'my-topic', priority: 5, fetch: fetchImpl })
    await n.notify({ kind: 'auth_failure', client: 'x' })
    expect(fetchImpl).toHaveBeenCalledOnce()
    const [url, init] = fetchImpl.mock.calls[0]!
    expect(url).toBe('https://ntfy.sh/my-topic')
    expect(String(init?.body)).toContain('x')

    const boom = ntfyNotifier({
      topic: 't',
      fetch: async () => {
        throw new Error('down')
      },
    })
    await expect(boom.notify({ kind: 'rate_limited', client: 'y' })).resolves.toBeUndefined()
  })
})

describe('debounceNotifier', () => {
  it('suppresses repeats of the same kind+client within the window', async () => {
    let calls = 0
    const inner: SecurityNotifier = { notify: async () => { calls += 1 } }
    let t = 0
    const n = debounceNotifier(inner, 1000, () => t)
    const ev: SecurityEvent = { kind: 'auth_failure', client: 'a' }
    await n.notify(ev)
    await n.notify(ev)
    expect(calls).toBe(1)
    t = 1000
    await n.notify(ev)
    expect(calls).toBe(2)
  })

  it('does not suppress different clients', async () => {
    let calls = 0
    const inner: SecurityNotifier = { notify: async () => { calls += 1 } }
    const n = debounceNotifier(inner, 1000, () => 0)
    await n.notify({ kind: 'forbidden_scope', client: 'a', tool: 't' })
    await n.notify({ kind: 'forbidden_scope', client: 'b', tool: 't' })
    expect(calls).toBe(2)
  })
})

describe('silentNotifier', () => {
  it('does nothing', async () => {
    await expect(
      silentNotifier().notify({ kind: 'rate_limited', client: 'z' }),
    ).resolves.toBeUndefined()
  })
})
