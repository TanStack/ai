import { describe, expect, it } from 'vitest'
import { createHarnessClient } from '../src/client'
import type { HarnessClient } from '../src/client'
import type { AnyHarness } from '../src/define'

/**
 * A fetch that fails at once when it gets no signal, and otherwise waits
 * until that signal aborts. `signals` records what each request got.
 */
function hangingFetch() {
  const signals: Array<AbortSignal> = []
  const fetch = (_input: unknown, init?: RequestInit): Promise<Response> => {
    const signal = init?.signal
    if (!signal) return Promise.reject(new Error('request had no signal'))
    signals.push(signal)
    return new Promise((_, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason), {
        once: true,
      })
    })
  }
  return { fetch, signals }
}

const cases: Array<
  [
    string,
    (
      client: HarnessClient<AnyHarness>,
      signal: AbortSignal,
    ) => Promise<unknown>,
  ]
> = [
  ['send', (c, signal) => c.send('hi', undefined, { signal })],
  ['cancel', (c, signal) => c.cancel({}, { signal })],
  ['unrevert', (c, signal) => c.unrevert({ signal })],
  ['snapshot', (c, signal) => c.snapshot({ signal })],
  ['describe', (c, signal) => c.describe({ signal })],
  [
    'putMedia',
    (c, signal) =>
      c.putMedia(
        { body: new Uint8Array([1]), mimeType: 'image/png', name: 'a.png' },
        { signal },
      ),
  ],
  ['loadMedia', (c, signal) => c.loadMedia({ id: 'm1' }, { signal })],
  ['sessions.list', (c, signal) => c.sessions.list({}, { signal })],
  [
    'sessions.rename',
    (c, signal) => c.sessions.rename({ threadId: 't', title: 'x' }, { signal }),
  ],
]

describe('harness client request signals', () => {
  it.each(cases)('%s passes the signal to fetch', async (_name, call) => {
    const { fetch, signals } = hangingFetch()
    const client = createHarnessClient<AnyHarness>({
      url: 'http://local/api/harness',
      threadId: 't1',
      fetch,
    })
    const controller = new AbortController()
    const pending = call(client, controller.signal)
    expect(signals).toHaveLength(1)
    expect(signals[0]).toBe(controller.signal)
    controller.abort()
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
  })
})
