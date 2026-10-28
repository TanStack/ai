// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/preact'
import { describe, expect, it, vi } from 'vitest'
import { useMcpAppBridge } from '../src/use-mcp-app-bridge'
import type { UseMcpAppBridgeOptions } from '../src/use-mcp-app-bridge'

type SendMessage = UseMcpAppBridgeOptions['chat']['sendMessage']

function options(
  overrides?: Partial<UseMcpAppBridgeOptions>,
): UseMcpAppBridgeOptions {
  return {
    threadId: 't1',
    callEndpoint: '/api/mcp-apps-call',
    chat: { sendMessage: vi.fn<SendMessage>(async () => {}) },
    ...overrides,
  }
}

describe('useMcpAppBridge', () => {
  it('returns a bridge exposing callTool, sendPrompt and openLink', () => {
    const { result } = renderHook(() => useMcpAppBridge(options()))
    expect(typeof result.current.callTool).toBe('function')
    expect(typeof result.current.sendPrompt).toBe('function')
    expect(typeof result.current.openLink).toBe('function')
  })

  it('returns a STABLE bridge across rerenders with a fresh options object', () => {
    const { result, rerender } = renderHook(
      (opts: UseMcpAppBridgeOptions) => useMcpAppBridge(opts),
      { initialProps: options() },
    )
    const first = result.current
    rerender(options())
    expect(result.current).toBe(first)
  })

  it('recreates the bridge when threadId changes', () => {
    const { result, rerender } = renderHook(
      (opts: UseMcpAppBridgeOptions) => useMcpAppBridge(opts),
      { initialProps: options({ threadId: 'a' }) },
    )
    const first = result.current
    rerender(options({ threadId: 'b' }))
    expect(result.current).not.toBe(first)
  })

  it('invokes the LATEST chat.sendMessage even though the bridge is stable', async () => {
    const first = vi.fn<SendMessage>(async () => {})
    const second = vi.fn<SendMessage>(async () => {})
    const { result, rerender } = renderHook(
      (opts: UseMcpAppBridgeOptions) => useMcpAppBridge(opts),
      { initialProps: options({ chat: { sendMessage: first } }) },
    )
    const bridge = result.current
    rerender(options({ chat: { sendMessage: second } }))
    expect(result.current).toBe(bridge)

    await act(async () => {
      await bridge.sendPrompt('hello')
    })
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
    expect(second.mock.calls[0]?.[0]).toBe('hello')
  })

  it('openLink forwards to the LATEST onLink handler', () => {
    const first = vi.fn<(url: string) => void>()
    const second = vi.fn<(url: string) => void>()
    const { result, rerender } = renderHook(
      (opts: UseMcpAppBridgeOptions) => useMcpAppBridge(opts),
      { initialProps: options({ onLink: first }) },
    )
    rerender(options({ onLink: second }))

    expect(result.current.openLink('https://example.com')).toEqual({
      isError: false,
    })
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledWith('https://example.com')
  })

  it('openLink returns { isError: true } when no onLink is provided (display-only)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { result } = renderHook(() => useMcpAppBridge(options()))
    expect(result.current.openLink('https://example.com')).toEqual({
      isError: true,
    })
    warn.mockRestore()
  })
})
