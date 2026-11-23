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
  onbufferedamountlow?: () => void
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
  const sender = { replaceTrack: vi.fn(async () => {}) }
  const pc = {
    createDataChannel: () => channel,
    addTrack: vi.fn(),
    addTransceiver: vi.fn(() => ({ sender })),
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
  return { track, stream, channel, pc, sender, getUserMedia }
}

function connect(
  overrides: {
    onError?: (error: Error) => void
    onClose?: () => void
    abortSignal?: AbortSignal
    autoCapture?: boolean
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
    onClose: overrides.onClose,
    abortSignal: overrides.abortSignal,
    autoCapture: overrides.autoCapture,
  })
  return { pending, loggedError: error }
}

/** Opens the data channel and waits for connect() to return the transport. */
async function openTransport(
  browser: ReturnType<typeof stubBrowser>,
  pending: ReturnType<typeof connect>['pending'],
) {
  await untilWaitingForChannel(browser.pc)
  browser.channel.readyState = 'open'
  browser.channel.onopen?.()
  return pending
}

/** Records the type of each event that the data channel took. */
function recordSentTypes(channel: FakeChannel) {
  const sent: Array<string> = []
  channel.send.mockImplementation((data: string) => {
    sent.push(JSON.parse(data).type)
  })
  return sent
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
    const browser = stubBrowser()
    const onError = vi.fn()
    const { pending } = connect({ onError })
    await openTransport(browser, pending)
    browser.channel.onerror?.(new Event('error'))

    expect(onError).toHaveBeenCalledWith(
      new Error('Data channel error: [object Event]'),
    )
    expect(browser.track.stop).not.toHaveBeenCalled()
  })

  it('calls onClose when the open data channel closes without close()', async () => {
    const browser = stubBrowser()
    const onClose = vi.fn()
    const { pending } = connect({ onClose })
    await openTransport(browser, pending)

    browser.channel.onclose?.()

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('does not call onClose when close() closes the channel', async () => {
    const browser = stubBrowser()
    const onClose = vi.fn()
    const { pending } = connect({ onClose })
    const transport = await openTransport(browser, pending)

    await transport.close()
    browser.channel.onclose?.()

    expect(onClose).not.toHaveBeenCalled()
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
    const browser = stubBrowser()
    vi.stubGlobal(
      'AudioContext',
      vi.fn(function AudioContext() {
        throw new Error('AudioContext is not allowed')
      }),
    )
    const { pending, loggedError } = connect()
    const transport = await openTransport(browser, pending)
    const visualization = transport.getAudioVisualization()

    expect(visualization.inputLevel).toBe(0)
    expect(visualization.getInputFrequencyData()).toEqual(new Uint8Array(1024))
    expect(loggedError).toHaveBeenCalledWith(
      expect.stringContaining('openai.test input audio analysis failed'),
      expect.objectContaining({
        error: new Error('AudioContext is not allowed'),
      }),
    )
    expect(browser.track.stop).not.toHaveBeenCalled()
    expect(browser.pc.addTrack).toHaveBeenCalled()
  })

  it('does not open the microphone on connect when autoCapture is false', async () => {
    const browser = stubBrowser()
    const { pending } = connect({ autoCapture: false })
    await openTransport(browser, pending)

    expect(browser.getUserMedia).not.toHaveBeenCalled()
    expect(browser.pc.addTransceiver).toHaveBeenCalledWith('audio', {
      direction: 'sendrecv',
    })
    expect(browser.pc.addTrack).not.toHaveBeenCalled()
  })

  it('opens the microphone on the first startAudioCapture and stops it on close', async () => {
    const browser = stubBrowser()
    const { pending } = connect({ autoCapture: false })
    const transport = await openTransport(browser, pending)

    await transport.startAudioCapture()
    await transport.startAudioCapture()

    expect(browser.getUserMedia).toHaveBeenCalledTimes(1)
    expect(browser.sender.replaceTrack).toHaveBeenCalledWith(browser.track)
    expect(browser.track.stop).not.toHaveBeenCalled()

    await transport.close()
    expect(browser.track.stop).toHaveBeenCalled()
  })

  it('keeps the microphone off when stop comes during the permission prompt', async () => {
    const browser = stubBrowser()
    let grantMicrophone = () => {}
    browser.getUserMedia.mockImplementation(
      () =>
        new Promise((resolve) => {
          grantMicrophone = () => resolve(browser.stream)
        }),
    )
    const { pending } = connect({ autoCapture: false })
    const transport = await openTransport(browser, pending)

    const starting = transport.startAudioCapture()
    await vi.waitFor(() => expect(browser.getUserMedia).toHaveBeenCalled())
    transport.stopAudioCapture()
    grantMicrophone()
    await starting

    expect(browser.sender.replaceTrack).toHaveBeenCalledWith(browser.track)
    expect(browser.track.enabled).toBe(false)

    await transport.startAudioCapture()
    expect(browser.track.enabled).toBe(true)
  })

  it('rejects startAudioCapture when the late microphone request fails', async () => {
    const browser = stubBrowser()
    browser.getUserMedia.mockRejectedValue(new Error('Permission denied'))
    const { pending } = connect({ autoCapture: false })
    const transport = await openTransport(browser, pending)

    await expect(transport.startAudioCapture()).rejects.toThrow(
      'Microphone access required for realtime voice: Permission denied',
    )
    expect(browser.sender.replaceTrack).not.toHaveBeenCalled()
  })

  it('keeps events that a full send buffer refuses and sends them in order after bufferedamountlow', async () => {
    const browser = stubBrowser()
    const onError = vi.fn()
    const { pending } = connect({ onError })
    const transport = await openTransport(browser, pending)
    const sent = recordSentTypes(browser.channel)
    browser.channel.send.mockImplementationOnce(() => {
      throw new DOMException(
        'RTCDataChannel send queue is full',
        'OperationError',
      )
    })

    transport.sendEvent({ type: 'response.item.create' })
    transport.sendEvent({ type: 'response.create' })
    expect(sent).toEqual([])

    browser.channel.onbufferedamountlow?.()
    expect(sent).toEqual(['response.item.create', 'response.create'])
    expect(onError).not.toHaveBeenCalled()
  })

  it('reports a send failure that is not a full buffer through onError', async () => {
    const browser = stubBrowser()
    const onError = vi.fn()
    const { pending } = connect({ onError })
    const transport = await openTransport(browser, pending)
    const sent = recordSentTypes(browser.channel)
    browser.channel.send.mockImplementationOnce(() => {
      throw new TypeError('Message too large')
    })

    transport.sendEvent({ type: 'session.update' })
    transport.sendEvent({ type: 'response.create' })

    expect(onError).toHaveBeenCalledWith(
      new Error('Failed to send session.update: Message too large'),
    )
    expect(sent).toEqual(['response.create'])
  })
})
