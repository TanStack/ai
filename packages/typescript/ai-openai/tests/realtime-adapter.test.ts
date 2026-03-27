import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { openaiRealtime } from '../src/realtime/adapter'

class MockDataChannel {
  readyState = 'connecting'
  onopen: (() => void) | null = null
  onmessage: ((event: MessageEvent) => void) | null = null
  onerror: ((error: Event) => void) | null = null
  send = vi.fn()
  close = vi.fn()

  constructor() {
    setTimeout(() => {
      this.readyState = 'open'
      this.onopen?.()
    }, 0)
  }
}

class MockRTCPeerConnection {
  ontrack: ((event: RTCTrackEvent) => void) | null = null
  addTrack = vi.fn()
  createOffer = vi.fn().mockResolvedValue({ sdp: 'offer-sdp' })
  setLocalDescription = vi.fn().mockResolvedValue(undefined)
  setRemoteDescription = vi.fn().mockResolvedValue(undefined)
  close = vi.fn()

  createDataChannel() {
    return new MockDataChannel() as unknown as RTCDataChannel
  }
}

class MockAudioContext {
  state = 'running'

  createAnalyser() {
    return {
      fftSize: 2048,
      frequencyBinCount: 1024,
      smoothingTimeConstant: 0,
      getByteFrequencyData: vi.fn(),
      getByteTimeDomainData: vi.fn(),
    } as unknown as AnalyserNode
  }

  createMediaStreamSource() {
    return {
      connect: vi.fn(),
    } as unknown as MediaStreamAudioSourceNode
  }

  resume = vi.fn().mockResolvedValue(undefined)
  close = vi.fn().mockResolvedValue(undefined)
}

class MockAudio {
  autoplay = false
  srcObject: MediaStream | null = null
  play = vi.fn().mockResolvedValue(undefined)
  pause = vi.fn()
}

describe('OpenAI realtime adapter', () => {
  beforeEach(() => {
    const track = {
      enabled: true,
      stop: vi.fn(),
    }
    const stream = {
      getAudioTracks: () => [track],
      getTracks: () => [track],
    }

    vi.stubGlobal('RTCPeerConnection', MockRTCPeerConnection)
    vi.stubGlobal('AudioContext', MockAudioContext)
    vi.stubGlobal('Audio', MockAudio)
    vi.stubGlobal('navigator', {
      mediaDevices: {
        getUserMedia: vi.fn().mockResolvedValue(stream),
      },
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('defaults WebRTC connections to gpt-realtime-1.5', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('answer-sdp', { status: 200 }),
    )

    const adapter = openaiRealtime()
    const connection = await adapter.connect({
      provider: 'openai',
      token: 'ephemeral-token',
      expiresAt: Date.now() + 60_000,
      config: {},
    })

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://api.openai.com/v1/realtime?model=gpt-realtime-1.5',
      {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ephemeral-token',
          'Content-Type': 'application/sdp',
        },
        body: 'offer-sdp',
      },
    )

    await connection.disconnect()
  })
})
