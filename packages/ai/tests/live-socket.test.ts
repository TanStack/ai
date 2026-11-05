import { afterEach, describe, expect, it, vi } from 'vitest'
import { openLiveSocket } from '../src/adapter-internals'
import { fakeWebSocket } from '../src/testing'
import type { LiveTranscriptionEvent } from '../src/activities/index'

function connect(extra: Partial<Parameters<typeof openLiveSocket>[0]> = {}) {
  const ws = fakeWebSocket()
  const events: Array<LiveTranscriptionEvent> = []
  let ended = 0
  const opening = openLiveSocket({
    url: 'wss://example.test/listen',
    WebSocket: ws.WebSocket,
    connect: { emit: (e) => events.push(e), end: () => ended++ },
    onMessage: () => {},
    ...extra,
  })
  return { ws, events, ended: () => ended, opening }
}

afterEach(() => vi.useRealTimers())

describe('openLiveSocket', () => {
  it('rejects a signal that is already aborted', async () => {
    const ws = fakeWebSocket()
    const abort = new AbortController()
    abort.abort(new Error('deadline'))
    await expect(
      openLiveSocket({
        url: 'wss://example.test',
        WebSocket: ws.WebSocket,
        connect: { emit: () => {}, end: () => {}, abortSignal: abort.signal },
        onMessage: () => {},
      }),
    ).rejects.toThrow('deadline')
    expect(ws.sockets).toHaveLength(0)
  })

  it('rejects connect when the provider fails before it is ready', async () => {
    const { ws, events, opening } = connect({
      readyWhen: (m) => (m as { type?: string }).type === 'ready',
      onMessage: (m, socket) => {
        if ((m as { type?: string }).type === 'error')
          socket.fail(new Error('bad setup'))
      },
    })
    const socket = ws.sockets[0]!
    socket.open()
    socket.receive({ type: 'error' })
    await expect(opening).rejects.toThrow('bad setup')
    expect(events).toEqual([])
  })

  it('emits an error event when the provider fails after it is ready', async () => {
    const { ws, events, opening } = connect()
    ws.sockets[0]!.open()
    const live = await opening
    live.fail(new Error('late'))
    expect(events.map((e) => e.type === 'error' && e.error.message)).toEqual([
      'late',
    ])
  })

  it('rejects connect when the provider is not ready in time', async () => {
    vi.useFakeTimers()
    const { ws, opening } = connect({
      readyWhen: () => false,
      connectTimeoutMs: 1000,
    })
    ws.sockets[0]!.open()
    const rejected = expect(opening).rejects.toThrow('Timed out after 1000 ms')
    await vi.advanceTimersByTimeAsync(1000)
    await rejected
  })
})
