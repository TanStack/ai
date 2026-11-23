import { afterEach, describe, expect, it, vi } from 'vitest'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import { createOpenAIWebRTCTransport } from '../src/realtime/webrtc-transport'
import type { Mock } from 'vitest'

interface FakeChannel {
  close: Mock
  send: Mock
  readyState: string
  onopen: (() => void) | null
  onclose: (() => void) | null
  onerror: ((event: Event) => void) | null
}

/** Fake browser WebRTC and microphone globals that record what was released. */
function stubBrowser() {
  const track = { kind: 'audio', enabled: true, stop: vi.fn() }
  const stream = { getAudioTracks: () => [track], getTracks: () => [track] }
  const channel: FakeChannel = {
    close: vi.fn(),
    send: vi.fn(),
    readyState: 'connecting',
    onopen: null,
    onclose: null,
    onerror: null,
  }
  const pc = {
    createDataChannel: () => channel,
    addTrack: vi.fn(),
    createOffer: async () => ({ type: 'offer', sdp: 'v=0' }),
    setLocalDescription: async () => {},
    setRemoteDescription: vi.fn(async () => {}),
    close: vi.fn(),
  }
  vi.stubGlobal(
    'RTCPeerConnection',
    vi.fn(function RTCPeerConnection() {
      return pc
    }),
  )
  const getUserMedia = vi.fn(async () => stream)
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } })
  vi.stubGlobal(
    'AudioContext',
    vi.fn(function AudioContext() {
      return {
        state: 'running',
        createAnalyser: () => ({ connect: vi.fn() }),
        createMediaStreamSource: () => ({ connect: vi.fn() }),
        close: vi.fn(async () => {}),
      }
    }),
  )
  return { track, stream, channel, pc, getUserMedia }
}

function connect(
  overrides: {
    onError?: (error: Error) => void
    abortSignal?: AbortSignal
  } = {},
) {
  const error = vi.fn()
  const logger = resolveDebugOption({
    logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error },
  })
  const pending = createOpenAIWebRTCTransport({
    logger,
    source: 'openai.test',
    exchangeSdp: async () => 'v=0',
    onServerEvent: () => {},
    onOpen: () => {},
    onError: overrides.onError ?? (() => {}),
    abortSignal: overrides.abortSignal,
  })
  return { pending, loggedError: error }
}

/** Waits until the SDP exchange is done and connect() waits for the channel. */
async function untilWaitingForChannel(
  pc: ReturnType<typeof stubBrowser>['pc'],
) {
  await vi.waitFor(() => expect(pc.setRemoteDescription).toHaveBeenCalled())
}

describe('createOpenAIWebRTCTransport', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('rejects and releases everything when the data channel closes before it opens', async () => {
    const { track, channel, pc } = stubBrowser()
    const { pending } = connect()
    await untilWaitingForChannel(pc)
    channel.onclose?.()

    await expect(pending).rejects.toThrow(
      'Data channel closed before it opened',
    )
    expect(track.stop).toHaveBeenCalled()
    expect(channel.close).toHaveBeenCalled()
    expect(pc.close).toHaveBeenCalled()
  })

  it('rejects instead of calling onError when the data channel fails before it opens', async () => {
    const { track, channel, pc } = stubBrowser()
    const onError = vi.fn()
    const { pending } = connect({ onError })
    await untilWaitingForChannel(pc)
    channel.onerror?.(new Event('error'))

    await expect(pending).rejects.toThrow('Data channel error')
    expect(onError).not.toHaveBeenCalled()
    expect(track.stop).toHaveBeenCalled()
    expect(channel.close).toHaveBeenCalled()
    expect(pc.close).toHaveBeenCalled()
  })

  it('reports a data channel error after it opens through onError', async () => {
    const { track, channel, pc } = stubBrowser()
    const onError = vi.fn()
    const { pending } = connect({ onError })
    await untilWaitingForChannel(pc)
    channel.onopen?.()
    await pending
    channel.onerror?.(new Event('error'))

    expect(onError).toHaveBeenCalledWith(
      new Error('Data channel error: [object Event]'),
    )
    expect(track.stop).not.toHaveBeenCalled()
  })

  it('rejects at once when the signal aborts while the microphone prompt is open, and stops a late stream', async () => {
    const { track, stream, channel, pc, getUserMedia } = stubBrowser()
    let grantMicrophone = () => {}
    getUserMedia.mockImplementation(
      () =>
        new Promise((resolve) => {
          grantMicrophone = () => resolve(stream)
        }),
    )
    const controller = new AbortController()
    const { pending } = connect({ abortSignal: controller.signal })
    await vi.waitFor(() => expect(getUserMedia).toHaveBeenCalled())
    controller.abort()

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    expect(channel.close).toHaveBeenCalled()
    expect(pc.close).toHaveBeenCalled()

    grantMicrophone()
    await vi.waitFor(() => expect(track.stop).toHaveBeenCalled())
    expect(pc.addTrack).not.toHaveBeenCalled()
  })

  it('connects without an input meter when audio analysis setup throws', async () => {
    const { track, channel, pc } = stubBrowser()
    vi.stubGlobal(
      'AudioContext',
      vi.fn(function AudioContext() {
        throw new Error('AudioContext is not allowed')
      }),
    )
    const { pending, loggedError } = connect()
    await untilWaitingForChannel(pc)
    channel.onopen?.()
    const transport = await pending
    const visualization = transport.getAudioVisualization()

    expect(visualization.inputLevel).toBe(0)
    expect(visualization.getInputFrequencyData()).toEqual(new Uint8Array(1024))
    expect(loggedError).toHaveBeenCalledWith(
      expect.stringContaining('openai.test input audio analysis failed'),
      expect.objectContaining({
        error: new Error('AudioContext is not allowed'),
      }),
    )
    expect(track.stop).not.toHaveBeenCalled()
    expect(pc.addTrack).toHaveBeenCalled()
  })
})
