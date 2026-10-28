import { describe, expect, it, vi } from 'vitest'
import type { Handle } from 'remix/ui'
import { createMcpAppBridge } from '../src/create-mcp-app-bridge'
import type { CreateMcpAppBridgeOptions } from '../src/create-mcp-app-bridge'

type SendMessage = CreateMcpAppBridgeOptions['chat']['sendMessage']

function createHandle(): Handle {
  const signal = new AbortController().signal
  const frame: Handle['frame'] = Object.assign(new EventTarget(), {
    src: '/',
    reload: async () => signal,
    replace: async () => {},
  })

  return {
    id: 'h1',
    props: {},
    context: {
      set() {},
      get() {
        return undefined
      },
    },
    update: async () => signal,
    queueTask() {},
    frame,
    frames: {
      get top() {
        return frame
      },
      get() {
        return undefined
      },
    },
    signal,
  }
}

function options(
  overrides?: Partial<CreateMcpAppBridgeOptions>,
): CreateMcpAppBridgeOptions {
  return {
    threadId: 't1',
    callEndpoint: '/api/mcp-apps-call',
    chat: { sendMessage: vi.fn<SendMessage>(async () => {}) },
    ...overrides,
  }
}

describe('createMcpAppBridge', () => {
  it('returns a bridge exposing callTool, sendPrompt and openLink', () => {
    const bridge = createMcpAppBridge(createHandle(), options())
    expect(typeof bridge.callTool).toBe('function')
    expect(typeof bridge.sendPrompt).toBe('function')
    expect(typeof bridge.openLink).toBe('function')
  })

  it('sendPrompt forwards text to chat.sendMessage', async () => {
    const sendMessage = vi.fn<SendMessage>(async () => {})
    const bridge = createMcpAppBridge(
      createHandle(),
      options({ chat: { sendMessage } }),
    )

    await bridge.sendPrompt('hello')

    expect(sendMessage.mock.calls).toEqual([['hello']])
  })
})
