import { renderHook } from '@solidjs/testing-library'
import { flush } from 'solid-js'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AudioRecorder } from '@tanstack/ai-client'
import { defineByok, memoryStorage } from '@tanstack/ai-client/byok'
import type { useAudioRecorder as UseAudioRecorder } from '../src/use-audio-recorder'
import type { useByok as UseByok } from '../src/use-byok'
import type {
  usePageWebMCPTools as UsePageWebMCPTools,
  useRegisterWebMCPTools as UseRegisterWebMCPTools,
} from '../src/use-web-mcp-tools'

const webmcp = vi.hoisted(() => ({
  subscribe: vi.fn(),
  register: vi.fn<
    (_tools: unknown, options: { signal: AbortSignal }) => Promise<void>
  >(async () => {}),
}))
vi.mock('@tanstack/ai-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/ai-client')>()),
  subscribeWebMCPTools: webmcp.subscribe,
  registerWebMCPTools: webmcp.register,
}))

afterEach(() => {
  vi.restoreAllMocks()
})

describe('Solid 2 external source lifecycles', () => {
  it('subscribes the recorder after setup and cancels on disposal', async () => {
    let useAudioRecorder: typeof UseAudioRecorder | undefined
    try {
      useAudioRecorder = (
        await vi.importActual<{ useAudioRecorder: typeof UseAudioRecorder }>(
          '../src/use-audio-recorder',
        )
      ).useAudioRecorder
    } catch {
      /* Absent during RED. */
    }
    expect(useAudioRecorder).toBeTypeOf('function')
    if (!useAudioRecorder) return
    const unsubscribe = vi.fn()
    const subscribe = vi
      .spyOn(AudioRecorder.prototype, 'subscribe')
      .mockImplementation((listener) => {
        listener('recording')
        return unsubscribe
      })
    const cancel = vi.spyOn(AudioRecorder.prototype, 'cancel')
    const { result, cleanup } = renderHook(() => {
      const hook = useAudioRecorder()
      expect(subscribe).not.toHaveBeenCalled()
      return hook
    })
    flush()
    expect(subscribe).toHaveBeenCalledOnce()
    cleanup()
    expect(unsubscribe).toHaveBeenCalledOnce()
    expect(cancel).toHaveBeenCalledOnce()
    expect(result.recording()).toBeNull()
  })

  it('seeds BYOK synchronously, catches pre-mount changes, and unsubscribes', async () => {
    let useByok: typeof UseByok | undefined
    try {
      useByok = (
        await vi.importActual<{ useByok: typeof UseByok }>('../src/use-byok')
      ).useByok
    } catch {
      /* Absent during RED. */
    }
    expect(useByok).toBeTypeOf('function')
    if (!useByok) return
    const client = defineByok({ storage: memoryStorage() })
    const unsubscribe = vi.fn()
    const subscribe = vi
      .spyOn(client, 'subscribe')
      .mockImplementation((listener) => {
        listener()
        return () => unsubscribe()
      })
    const { result, cleanup } = renderHook(() => {
      const snapshot = useByok(client)
      expect(snapshot()).toEqual(client.getSnapshot())
      expect(subscribe).not.toHaveBeenCalled()
      return snapshot
    })
    flush()
    expect(subscribe).toHaveBeenCalledOnce()
    expect(result()).toEqual(client.getSnapshot())
    cleanup()
    expect(unsubscribe).toHaveBeenCalledOnce()
  })

  it('accepts synchronous WebMCP tools and aborts both resources on disposal', async () => {
    let hooks:
      | {
          usePageWebMCPTools: typeof UsePageWebMCPTools
          useRegisterWebMCPTools: typeof UseRegisterWebMCPTools
        }
      | undefined
    try {
      hooks = await vi.importActual('../src/use-web-mcp-tools')
    } catch {
      /* Absent during RED. */
    }
    expect(hooks?.usePageWebMCPTools).toBeTypeOf('function')
    expect(hooks?.useRegisterWebMCPTools).toBeTypeOf('function')
    if (!hooks) return
    const signals: Array<AbortSignal> = []
    webmcp.subscribe.mockImplementation((listener, options) => {
      signals.push(options.signal)
      listener([])
    })
    webmcp.register.mockImplementation(async (_tools, options) => {
      signals.push(options.signal)
    })
    const { result, cleanup } = renderHook(() => {
      const tools = hooks.usePageWebMCPTools()
      hooks.useRegisterWebMCPTools([])
      expect(signals).toHaveLength(0)
      return tools
    })
    flush()
    expect(result()).toEqual([])
    expect(signals).toHaveLength(2)
    cleanup()
    expect(signals.every((signal) => signal.aborted)).toBe(true)
  })
})
