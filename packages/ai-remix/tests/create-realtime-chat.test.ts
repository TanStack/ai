import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RealtimeToken } from '@tanstack/ai'
import type { RealtimeAdapter, RealtimeConnection } from '@tanstack/ai-client'
import type { Handle } from 'remix/ui'
import { createRealtimeChat } from '../src/create-realtime-chat'
import type { CreateRealtimeChatOptions } from '../src/realtime-types'

function createConnection(): RealtimeConnection {
  return {
    disconnect: vi.fn(async () => {}),
    startAudioCapture: vi.fn(async () => {}),
    stopAudioCapture: vi.fn(),
    sendText: vi.fn(),
    sendImage: vi.fn(),
    sendToolResult: vi.fn(),
    updateSession: vi.fn(),
    interrupt: vi.fn(),
    on: () => () => {},
    getAudioVisualization: () => ({
      inputLevel: 0,
      outputLevel: 0,
      getInputFrequencyData: () => new Uint8Array(128),
      getOutputFrequencyData: () => new Uint8Array(128),
      getInputTimeDomainData: () => new Uint8Array(128),
      getOutputTimeDomainData: () => new Uint8Array(128),
      inputSampleRate: 48_000,
      outputSampleRate: 48_000,
    }),
  }
}

function createAdapter(
  provider: string,
  connections: Array<RealtimeConnection>,
) {
  const remaining = [...connections]
  const connect = vi.fn<RealtimeAdapter['connect']>(async () => {
    const connection = remaining.shift()
    if (!connection) throw new Error(`No ${provider} test connection remains`)
    return connection
  })
  const adapter: RealtimeAdapter = { provider, connect }
  return { adapter, connect }
}

function createToken(
  provider: string,
  value: string,
  expiresAt: number = Date.now() + 3_600_000,
): RealtimeToken {
  return { provider, token: value, expiresAt, config: {} }
}

function createHandle() {
  const controller = new AbortController()
  const frame = Object.assign(new EventTarget(), {
    src: '',
    reload: async () => controller.signal,
    replace: async () => {},
  })
  const handle: Handle = {
    id: 'realtime-chat',
    props: {},
    context: {
      set() {},
      get() {
        return undefined
      },
    },
    update: vi.fn(async () => controller.signal),
    queueTask() {},
    frame,
    frames: {
      top: frame,
      get() {
        return undefined
      },
    },
    signal: controller.signal,
  }
  return { handle, abort: () => controller.abort() }
}

function createOptions(
  adapter: RealtimeAdapter,
  getToken: CreateRealtimeChatOptions['getToken'],
): CreateRealtimeChatOptions {
  return { adapter, getToken, autoCapture: false }
}

let abortHandle: (() => void) | undefined

beforeEach(() => {
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn(() => 1),
  )
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
})

afterEach(() => {
  abortHandle?.()
  abortHandle = undefined
  vi.unstubAllGlobals()
})

describe('createRealtimeChat', () => {
  it('connects and exposes connected status', async () => {
    const { handle, abort } = createHandle()
    abortHandle = abort
    const connection = createConnection()
    const testAdapter = createAdapter('test', [connection])
    const getToken = vi.fn(async () => createToken('test', 'token'))
    const chat = createRealtimeChat(
      handle,
      createOptions(testAdapter.adapter, getToken),
    )

    expect(chat.status).toBe('idle')
    await chat.connect()
    expect(chat.status).toBe('connected')
  })
})
