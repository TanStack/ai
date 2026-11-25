import { afterEach, describe, expect, it, vi } from 'vitest'
import { openaiRealtime } from '../src/realtime/adapter'
import type { RealtimeToken } from '@tanstack/ai'

const token: RealtimeToken = {
  provider: 'openai',
  token: 'ek_test',
  expiresAt: Date.now() + 60_000,
  config: { model: 'gpt-realtime-2.1' },
}

/** Fake browser WebRTC and microphone globals that record what was released. */
function stubBrowser() {
  const track = { kind: 'audio', stop: vi.fn() }
  const stream = { getAudioTracks: () => [track], getTracks: () => [track] }
  const channel = { close: vi.fn() }
  const pc = {
    createDataChannel: () => channel,
    addTrack: vi.fn(),
    createOffer: async () => ({ type: 'offer', sdp: 'v=0' }),
    setLocalDescription: async () => {},
    close: vi.fn(),
  }
  vi.stubGlobal(
    'RTCPeerConnection',
    vi.fn(function RTCPeerConnection() {
      return pc
    }),
  )
  vi.stubGlobal('navigator', {
    mediaDevices: { getUserMedia: async () => stream },
  })
  return { track, channel, pc }
}

describe('openaiRealtime connect teardown', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('releases the microphone and the peer connection when the SDP request aborts', async () => {
    const { track, channel, pc } = stubBrowser()
    vi.stubGlobal(
      'fetch',
      (_url: string, init?: RequestInit) =>
        new Promise((_, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(init.signal?.reason),
          )
        }),
    )
    const controller = new AbortController()
    const pending = openaiRealtime().connect(token, undefined, {
      abortSignal: controller.signal,
    })
    await vi.waitFor(() => expect(pc.addTrack).toHaveBeenCalled())
    controller.abort()

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    expect(track.stop).toHaveBeenCalled()
    expect(channel.close).toHaveBeenCalled()
    expect(pc.close).toHaveBeenCalled()
  })

  it('does not ask for the microphone when the signal is already aborted', async () => {
    const { pc } = stubBrowser()
    const getUserMedia = vi.fn()
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } })
    const controller = new AbortController()
    controller.abort()

    await expect(
      openaiRealtime().connect(token, undefined, {
        abortSignal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(getUserMedia).not.toHaveBeenCalled()
    expect(pc.close).toHaveBeenCalled()
  })

  it('releases them when the SDP request fails', async () => {
    const { track, pc } = stubBrowser()
    vi.stubGlobal('fetch', async () => new Response('bad', { status: 500 }))

    await expect(openaiRealtime().connect(token)).rejects.toThrow(
      'Failed to establish WebRTC connection',
    )
    expect(track.stop).toHaveBeenCalled()
    expect(pc.close).toHaveBeenCalled()
  })

  it('releases everything when disconnect() aborts the wait for the data channel', async () => {
    const { track, channel, pc } = stubBrowser()
    Object.assign(pc, { setRemoteDescription: async () => {} })
    const audioContext = {
      state: 'running',
      createAnalyser: () => ({ connect: vi.fn() }),
      createMediaStreamSource: () => ({ connect: vi.fn() }),
      close: vi.fn(async () => {}),
    }
    const AudioContextMock = vi.fn(function AudioContext() {
      return audioContext
    })
    vi.stubGlobal('AudioContext', AudioContextMock)
    vi.stubGlobal('fetch', async () => new Response('v=0', { status: 200 }))
    const controller = new AbortController()
    // The data channel never opens, so connect() waits until the abort.
    const settled = expect(
      openaiRealtime().connect(token, undefined, {
        abortSignal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: 'AbortError' })
    // The SDP step is done once the input audio analysis starts.
    await vi.waitFor(() => expect(AudioContextMock).toHaveBeenCalled())
    controller.abort()

    await settled
    expect(track.stop).toHaveBeenCalled()
    expect(channel.close).toHaveBeenCalled()
    expect(pc.close).toHaveBeenCalled()
    expect(audioContext.close).toHaveBeenCalled()
  })
})
