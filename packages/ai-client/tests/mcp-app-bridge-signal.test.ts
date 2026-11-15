import { describe, expect, it, vi } from 'vitest'
import { createMcpAppBridge } from '../src/mcp-app-bridge'

/** Waits until the request signal aborts; fails at once without a signal. */
function hangingFetch() {
  return vi.fn(
    (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const signal = init?.signal
      if (!signal) return Promise.reject(new Error('request had no signal'))
      return new Promise((_, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason), {
          once: true,
        })
      })
    },
  )
}

describe('createMcpAppBridge callTool signal', () => {
  it('passes the signal to the call request and rejects on abort', async () => {
    const fetchImpl = hangingFetch()
    const bridge = createMcpAppBridge({
      threadId: 't1',
      callEndpoint: '/api/mcp-call',
      chat: { sendMessage: async () => {} },
      fetchImpl,
    })
    const controller = new AbortController()
    const pending = bridge.callTool(
      { toolName: 'place_order' },
      { signal: controller.signal },
    )
    expect(fetchImpl.mock.calls[0]![1]?.signal).toBe(controller.signal)
    controller.abort()
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
  })
})
