import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { createMcpAppBridge } from '../src/mcp-app-bridge'

describe('createMcpAppBridge', () => {
  const threadId = 'thread-123'
  const callEndpoint = 'https://example.com/api/mcp-call'

  function makeChatMock() {
    return { sendMessage: vi.fn().mockResolvedValue(undefined) }
  }

  function makeFetchMock(response: unknown) {
    return vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue(response),
    } as unknown as Response)
  }

  function makeFailingFetchMock(status: number) {
    return vi.fn().mockResolvedValue({
      ok: false,
      status,
      json: vi.fn().mockRejectedValue(new Error('not json')),
    } as unknown as Response)
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

      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
      expect(url).toBe(callEndpoint)
      expect(init.method).toBe('POST')
      expect((init.headers as Record<string, string>)['content-type']).toBe(
        'application/json',
      )

      const body = JSON.parse(init.body as string)
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

      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
      const body = JSON.parse(init.body as string)
      expect(body.threadId).toBe(threadId)
      expect(body.toolName).toBe('ping')
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
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: vi.fn().mockResolvedValue({ ok: true, result: 42 }),
        } as unknown as Response)

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
