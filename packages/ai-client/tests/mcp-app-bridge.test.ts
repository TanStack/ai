import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { createMcpAppBridge } from '../src/mcp-app-bridge'
import type { CreateMcpAppBridgeOptions } from '../src/mcp-app-bridge'

type ChatMock = {
  sendMessage: ReturnType<
    typeof vi.fn<CreateMcpAppBridgeOptions['chat']['sendMessage']>
  >
}

describe('createMcpAppBridge', () => {
  const threadId = 'thread-123'
  const callEndpoint = 'https://example.com/api/mcp-call'

  function makeChatMock(): ChatMock {
    return { sendMessage: vi.fn(async () => {}) }
  }

  /**
   * A minimal `Response` carrying just the members the bridge reads (`ok`,
   * `status`, `json`). `Response` is a wide DOM type with no structural
   * overlap with this partial, so one cast bridges it — centralized here.
   */
  function fakeResponse(init: {
    ok: boolean
    status: number
    json: () => Promise<unknown>
  }): Response {
    return init as unknown as Response
  }

  function makeFetchMock(response: unknown) {
    return vi.fn<typeof fetch>(async () =>
      fakeResponse({
        ok: true,
        status: 200,
        json: async () => response,
      }),
    )
  }

  function makeFailingFetchMock(status: number) {
    return vi.fn<typeof fetch>(async () =>
      fakeResponse({
        ok: false,
        status,
        json: async () => {
          throw new Error('not json')
        },
      }),
    )
  }

  /**
   * Pull the recorded request out of a typed fetch mock and narrow the parts
   * the bridge always sets (a string URL, a plain-object header map, a JSON
   * string body) via runtime guards — no casts.
   */
  function readFetchCall(fetchMock: ReturnType<typeof makeFetchMock>) {
    const call = fetchMock.mock.calls[0]
    if (!call) throw new Error('fetch was not called')
    const [url, init] = call
    if (typeof url !== 'string') throw new Error('expected a string URL')
    if (!init) throw new Error('expected request init')

    const headers = init.headers
    if (
      typeof headers !== 'object' ||
      headers === null ||
      headers instanceof Headers ||
      Array.isArray(headers)
    ) {
      throw new Error('expected a plain-object header map')
    }

    if (typeof init.body !== 'string') {
      throw new Error('expected a string request body')
    }
    const body: unknown = JSON.parse(init.body)

    return { url, method: init.method, headers, body }
  }

  describe('callTool', () => {
    it('POSTs to callEndpoint with correct body and returns result', async () => {
      const fetchMock = makeFetchMock({ ok: true, result: { price: 1999 } })
      const chat = makeChatMock()

      const bridge = createMcpAppBridge({
        threadId,
        callEndpoint,
        chat,
        fetchImpl: fetchMock,
      })

      const result = await bridge.callTool({
        serverId: 'server-1',
        toolName: 'getPrice',
        args: { productId: 'abc' },
        messageId: 'msg-42',
      })

      expect(result).toEqual({ price: 1999 })
      expect(fetchMock).toHaveBeenCalledOnce()

      const { url, method, headers, body } = readFetchCall(fetchMock)
      expect(url).toBe(callEndpoint)
      expect(method).toBe('POST')
      expect(headers['content-type']).toBe('application/json')
      expect(body).toEqual({
        threadId,
        serverId: 'server-1',
        toolName: 'getPrice',
        args: { productId: 'abc' },
        messageId: 'msg-42',
      })
    })

    it('omits undefined optional fields when not provided', async () => {
      const fetchMock = makeFetchMock({ ok: true, result: null })
      const chat = makeChatMock()

      const bridge = createMcpAppBridge({
        threadId,
        callEndpoint,
        chat,
        fetchImpl: fetchMock,
      })

      await bridge.callTool({ toolName: 'ping' })

      const { body } = readFetchCall(fetchMock)
      expect(body).toMatchObject({ threadId, toolName: 'ping' })
    })

    it('throws when response ok is false', async () => {
      const fetchMock = makeFetchMock({ ok: false, error: 'tool not found' })
      const chat = makeChatMock()

      const bridge = createMcpAppBridge({
        threadId,
        callEndpoint,
        chat,
        fetchImpl: fetchMock,
      })

      await expect(bridge.callTool({ toolName: 'missing' })).rejects.toThrow(
        'tool not found',
      )
    })

    it('throws fallback message when ok is false and no error string', async () => {
      const fetchMock = makeFetchMock({ ok: false })
      const chat = makeChatMock()

      const bridge = createMcpAppBridge({
        threadId,
        callEndpoint,
        chat,
        fetchImpl: fetchMock,
      })

      await expect(bridge.callTool({ toolName: 'broken' })).rejects.toThrow(
        'MCP app tool call failed',
      )
    })

    it('throws when HTTP response is non-2xx (e.g. 500)', async () => {
      const fetchMock = makeFailingFetchMock(500)
      const chat = makeChatMock()

      const bridge = createMcpAppBridge({
        threadId,
        callEndpoint,
        chat,
        fetchImpl: fetchMock,
      })

      await expect(bridge.callTool({ toolName: 'boom' })).rejects.toThrow(
        'HTTP 500',
      )
    })

    it('uses global fetch when fetchImpl is omitted', async () => {
      const globalFetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(
          fakeResponse({
            ok: true,
            status: 200,
            json: async () => ({ ok: true, result: 42 }),
          }),
        )

      const chat = makeChatMock()
      const bridge = createMcpAppBridge({ threadId, callEndpoint, chat })

      const result = await bridge.callTool({ toolName: 'test' })
      expect(result).toBe(42)

      globalFetchSpy.mockRestore()
    })
  })

  describe('sendPrompt', () => {
    it('forwards text to chat.sendMessage', async () => {
      const chat = makeChatMock()
      const bridge = createMcpAppBridge({ threadId, callEndpoint, chat })

      await bridge.sendPrompt('hello from bridge')

      expect(chat.sendMessage).toHaveBeenCalledOnce()
      expect(chat.sendMessage).toHaveBeenCalledWith('hello from bridge')
    })

    it('returns void', async () => {
      const chat = makeChatMock()
      const bridge = createMcpAppBridge({ threadId, callEndpoint, chat })

      const result = await bridge.sendPrompt('any')
      expect(result).toBeUndefined()
    })
  })

  describe('openLink', () => {
    let warnSpy: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
      warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    })

    afterEach(() => {
      warnSpy.mockRestore()
    })

    it('returns { isError: true } when onLink is not provided', () => {
      const chat = makeChatMock()
      const bridge = createMcpAppBridge({ threadId, callEndpoint, chat })

      const result = bridge.openLink('https://example.com')
      expect(result).toEqual({ isError: true })
    })

    it('emits a console.warn when onLink is not provided', () => {
      const chat = makeChatMock()
      const bridge = createMcpAppBridge({ threadId, callEndpoint, chat })

      bridge.openLink('https://example.com')

      expect(warnSpy).toHaveBeenCalledOnce()
      expect(warnSpy).toHaveBeenCalledWith(
        '[mcp-app-bridge] openLink ignored: no onLink handler configured',
      )
    })

    it('calls onLink and returns { isError: false } when onLink is provided', () => {
      const onLink = vi.fn()
      const chat = makeChatMock()
      const bridge = createMcpAppBridge({
        threadId,
        callEndpoint,
        chat,
        onLink,
      })

      const result = bridge.openLink('https://example.com/page')
      expect(result).toEqual({ isError: false })
      expect(onLink).toHaveBeenCalledOnce()
      expect(onLink).toHaveBeenCalledWith('https://example.com/page')
    })

    it('does not call onLink when it is absent', () => {
      const onLink = vi.fn()
      const chat = makeChatMock()
      // Bridge created without onLink — onLink above should never be called
      const bridge = createMcpAppBridge({ threadId, callEndpoint, chat })
      bridge.openLink('https://example.com')

      expect(onLink).not.toHaveBeenCalled()
    })
  })
})
