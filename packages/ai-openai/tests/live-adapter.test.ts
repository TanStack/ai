import { afterEach, describe, expect, it, vi } from 'vitest'
import { openaiLive } from '../src/realtime/live-adapter'
import type {
  RealtimeConnectOptions,
  RealtimeConnection,
  RealtimeEventPayloads,
  RealtimeRelayCreateSession,
  RealtimeSessionAnswer,
} from '@tanstack/ai'

const answer: RealtimeSessionAnswer = {
  provider: 'openai',
  sessionId: 'sess_1',
  sdp: 'answer-sdp',
  config: { model: 'gpt-live-1.1' },
}

interface FakeChannel {
  readyState: string
  send: ReturnType<typeof vi.fn>
  close: ReturnType<typeof vi.fn>
  onopen?: () => void
  onclose?: () => void
  onmessage?: (event: { data: string }) => void
}

/** Fake browser WebRTC, microphone, and audio context globals. */
function stubBrowser() {
  const track = { kind: 'audio', enabled: true, stop: vi.fn() }
  const stream = { getAudioTracks: () => [track], getTracks: () => [track] }
  const channel: FakeChannel = {
    readyState: 'connecting',
    send: vi.fn(),
    close: vi.fn(),
  }
  const pc = {
    createDataChannel: () => channel,
    addTrack: vi.fn(),
    addTransceiver: () => ({ sender: { replaceTrack: async () => {} } }),
    createOffer: async () => ({ type: 'offer', sdp: 'offer-sdp' }),
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
  const audioContext = {
    state: 'running',
    createAnalyser: () => ({ connect: vi.fn() }),
    createMediaStreamSource: () => ({ connect: vi.fn() }),
    close: vi.fn(async () => {}),
  }
  vi.stubGlobal(
    'AudioContext',
    vi.fn(function AudioContext() {
      return audioContext
    }),
  )
  return { track, channel, pc, audioContext, getUserMedia }
}

const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }

/** In a browser, each data channel message is a new task. Wait for one. */
function nextTask() {
  return new Promise((resolve) => setImmediate(resolve))
}

/**
 * Start connect with fake globals and open the data channel. The server has
 * not sent `session.started` yet, so `pending` has not resolved.
 */
async function openLive(
  createSession: RealtimeRelayCreateSession = async () => answer,
  connectOptions?: RealtimeConnectOptions,
) {
  const browser = stubBrowser()
  const pending = openaiLive({ debug: { logger } }).connect(
    createSession,
    undefined,
    connectOptions,
  )
  await vi.waitFor(() =>
    expect(browser.pc.setRemoteDescription).toHaveBeenCalled(),
  )
  browser.channel.readyState = 'open'
  browser.channel.onopen?.()
  await nextTask()
  function sentEvents() {
    return browser.channel.send.mock.calls.map(([data]) =>
      JSON.parse(String(data)),
    )
  }
  return {
    ...browser,
    pending,
    serverSends(event: object) {
      browser.channel.onmessage?.({ data: JSON.stringify(event) })
    },
    sentEvents,
    sentTypes() {
      return sentEvents().map((event) => event.type)
    },
  }
}

/** Open the data channel, start the session, and wait for the connection. */
async function connectLive(
  createSession?: RealtimeRelayCreateSession,
  connectOptions?: RealtimeConnectOptions,
) {
  const live = await openLive(createSession, connectOptions)
  live.serverSends({ type: 'session.started' })
  return { ...live, connection: await live.pending }
}

/** Record every payload of one event type. */
function record<TEvent extends keyof RealtimeEventPayloads>(
  connection: RealtimeConnection,
  event: TEvent,
) {
  const payloads: Array<RealtimeEventPayloads[TEvent]> = []
  connection.on(event, (payload) => payloads.push(payload))
  return payloads
}

function functionCall(callId: string, args = '{"city":"Paris"}') {
  return {
    type: 'response.event',
    delegation_id: 'del_1',
    event: {
      type: 'response.output_item.done',
      item: {
        type: 'function_call',
        call_id: callId,
        name: 'get_weather',
        arguments: args,
      },
    },
  }
}

const responseCompleted = {
  type: 'response.event',
  delegation_id: 'del_1',
  event: { type: 'response.completed' },
}

describe('openaiLive', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('sends the offer through createSession and sets the answer', async () => {
    const createSession = vi.fn(async () => answer)
    const { pc } = await connectLive(createSession)

    expect(createSession).toHaveBeenCalledWith({ sdp: 'offer-sdp' })
    expect(pc.setRemoteDescription).toHaveBeenCalledWith({
      type: 'answer',
      sdp: 'answer-sdp',
    })
  })

  it('returns the connection only after session.started', async () => {
    const { pending, serverSends } = await openLive()
    let isConnected = false
    void pending.then(() => {
      isConnected = true
    })

    await nextTask()
    expect(isConnected).toBe(false)

    serverSends({ type: 'session.started' })
    await pending
    expect(isConnected).toBe(true)
  })

  it('rejects connect and stops the mic when the session closes before it starts', async () => {
    const { pending, serverSends, track, pc } = await openLive()

    serverSends({ type: 'session.closed', reason: 'expired' })

    await expect(pending).rejects.toThrow('GPT-Live session closed: expired')
    expect(track.stop).toHaveBeenCalled()
    expect(pc.close).toHaveBeenCalled()
  })

  it('rejects connect and stops the mic when session.started does not come in 15 s', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const { pending, track } = await openLive()
    const rejection = expect(pending).rejects.toThrow(
      'GPT-Live session did not start in 15 s',
    )

    await vi.advanceTimersByTimeAsync(15_000)

    await rejection
    expect(track.stop).toHaveBeenCalled()
  })

  it('disconnect sends session.close and closes once after session.closed', async () => {
    const { connection, serverSends, sentTypes, track, audioContext } =
      await connectLive()

    const done = connection.disconnect()
    await nextTask()
    expect(sentTypes()).toEqual(['session.close'])
    expect(track.stop).not.toHaveBeenCalled()

    serverSends({ type: 'session.closed', reason: 'close_requested' })
    await done

    expect(track.stop).toHaveBeenCalled()
    expect(audioContext.close).toHaveBeenCalledTimes(1)
  })

  it('disconnect closes after 1 s when session.closed does not come', async () => {
    const { connection, track } = await connectLive()
    vi.useFakeTimers()

    const done = connection.disconnect()
    await vi.advanceTimersByTimeAsync(999)
    expect(track.stop).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1)
    await done
    expect(track.stop).toHaveBeenCalled()
  })

  it('updateSession drops delegation.model and sends the other delegation fields', async () => {
    const { connection, sentEvents } = await connectLive()

    connection.updateSession({
      providerOptions: {
        delegation: { model: 'gpt-5.5', instructions: 'Be brief.' },
      },
    })

    expect(sentEvents()).toEqual([
      {
        type: 'session.update',
        session: { delegation: { responses: { instructions: 'Be brief.' } } },
      },
    ])
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('updateSession'),
      { source: 'openai.live', ignored: ['providerOptions.delegation.model'] },
    )
  })

  it('updateSession sends nothing when delegation has only the model', async () => {
    const { connection, sentTypes } = await connectLive()

    connection.updateSession({
      providerOptions: { delegation: { model: 'gpt-5.5' } },
    })

    expect(sentTypes()).toEqual([])
  })

  it('maps transcript deltas', async () => {
    const { connection, serverSends } = await connectLive()
    const transcripts = record(connection, 'transcript')

    serverSends({ type: 'session.input_transcript.delta', delta: 'Hel' })
    serverSends({ type: 'session.input_transcript.delta', delta: 'lo' })

    expect(transcripts).toEqual([
      { role: 'user', transcript: 'Hel', isFinal: false },
      { role: 'user', transcript: 'Hello', isFinal: false },
    ])
  })

  it('completes the user message when the assistant starts speaking', async () => {
    const { connection, serverSends } = await connectLive()
    const transcripts = record(connection, 'transcript')
    const modes = record(connection, 'mode_change')

    serverSends({ type: 'session.input_transcript.delta', delta: 'Hi' })
    serverSends({ type: 'session.output_transcript.delta', delta: 'Hey' })

    expect(transcripts).toEqual([
      { role: 'user', transcript: 'Hi', isFinal: false },
      { role: 'user', transcript: 'Hi', isFinal: true },
      { role: 'assistant', transcript: 'Hey', isFinal: false },
    ])
    expect(modes.at(-1)).toEqual({ mode: 'speaking' })
  })

  it('completes the assistant message when the user speaks again', async () => {
    const { connection, serverSends } = await connectLive()
    const messages = record(connection, 'message_complete')

    serverSends({ type: 'session.output_transcript.delta', delta: 'Sunny ' })
    serverSends({ type: 'session.output_transcript.delta', delta: 'today.' })
    serverSends({ type: 'session.input_transcript.delta', delta: 'Thanks' })

    expect(messages).toHaveLength(1)
    expect(messages[0]?.message).toMatchObject({
      role: 'assistant',
      parts: [{ type: 'audio', transcript: 'Sunny today.' }],
    })
  })

  it('maps a function call to tool_call', async () => {
    const { connection, serverSends } = await connectLive()
    const toolCalls = record(connection, 'tool_call')

    serverSends(functionCall('call_1'))

    expect(toolCalls).toEqual([
      {
        toolCallId: 'call_1',
        toolName: 'get_weather',
        input: { city: 'Paris' },
      },
    ])
  })

  it('passes the raw arguments when they are not valid JSON', async () => {
    const { connection, serverSends } = await connectLive()
    const toolCalls = record(connection, 'tool_call')

    serverSends(functionCall('call_1', '{"city":'))

    expect(toolCalls[0]?.input).toBe('{"city":')
    // The log has no arguments and no parser error: they can hold user data.
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('tool arguments are not valid JSON'),
      { source: 'openai.live', toolName: 'get_weather', toolCallId: 'call_1' },
    )
  })

  it('does not send a tool result for an unknown call id', async () => {
    const { connection, sentTypes } = await connectLive()

    connection.sendToolResult('call_unknown', '"secret"')

    expect(sentTypes()).toEqual([])
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('sendToolResult for an unknown tool call'),
      { source: 'openai.live', callId: 'call_unknown' },
    )
  })

  it('sends response.create once after two parallel tool results', async () => {
    const { connection, serverSends, sentTypes } = await connectLive()
    serverSends(functionCall('call_1'))
    serverSends(functionCall('call_2'))
    serverSends(responseCompleted)

    connection.sendToolResult('call_1', '"sunny"')
    expect(sentTypes()).toEqual(['response.item.create'])

    connection.sendToolResult('call_2', '"rainy"')
    expect(sentTypes()).toEqual([
      'response.item.create',
      'response.item.create',
      'response.create',
    ])
  })

  it('waits for response.completed when a tool result comes before the next call', async () => {
    const { connection, serverSends, sentTypes } = await connectLive()
    serverSends(functionCall('call_1'))
    connection.sendToolResult('call_1', '"sunny"')
    serverSends(functionCall('call_2'))
    connection.sendToolResult('call_2', '"rainy"')
    expect(sentTypes()).not.toContain('response.create')

    serverSends(responseCompleted)
    expect(sentTypes().filter((type) => type === 'response.create')).toEqual([
      'response.create',
    ])
  })

  it('emits an error when the session closes for a reason other than close_requested', async () => {
    const { connection, serverSends } = await connectLive()
    const errors = record(connection, 'error')
    const statuses = record(connection, 'status_change')

    serverSends({ type: 'session.closed', reason: 'expired' })

    expect(errors[0]?.error.message).toBe('GPT-Live session closed: expired')
    expect(statuses).toEqual([{ status: 'idle' }])
  })

  it('stops the mic and the peer when the server closes the session', async () => {
    const { serverSends, track, pc } = await connectLive()

    serverSends({ type: 'session.closed', reason: 'remote_hangup' })

    expect(track.stop).toHaveBeenCalled()
    expect(pc.close).toHaveBeenCalled()
  })

  it('ends the session when the data channel closes without session.closed', async () => {
    const { connection, channel, track, pc } = await connectLive()
    const errors = record(connection, 'error')
    const statuses = record(connection, 'status_change')

    channel.onclose?.()

    expect(errors[0]?.error.message).toBe(
      'GPT-Live session closed: connection_lost',
    )
    expect(statuses).toEqual([{ status: 'idle' }])
    expect(track.stop).toHaveBeenCalled()
    expect(pc.close).toHaveBeenCalled()
  })

  it('maps usage seconds to billed seconds', async () => {
    const { connection, serverSends } = await connectLive()
    const usage = record(connection, 'usage')

    serverSends({
      type: 'session.usage.updated',
      usage: { seconds: 12 },
      context_window: { usage_ratio: 0.1 },
    })

    expect(usage).toEqual([
      {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        billed: { quantity: 12, unit: 'seconds' },
      },
    ])
  })

  it('stops the mic when disconnect runs during createSession', async () => {
    const { track, channel, pc } = stubBrowser()
    const controller = new AbortController()
    // The server never answers.
    const createSession = vi.fn(
      () => new Promise<RealtimeSessionAnswer>(() => {}),
    )
    const pending = openaiLive({ debug: { logger } }).connect(
      createSession,
      undefined,
      { abortSignal: controller.signal },
    )
    await vi.waitFor(() => expect(createSession).toHaveBeenCalled())
    controller.abort()

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    expect(track.stop).toHaveBeenCalled()
    expect(channel.close).toHaveBeenCalled()
    expect(pc.close).toHaveBeenCalled()
  })

  it('does not leave an unhandled rejection when the signal aborts after connect', async () => {
    const unhandled: Array<unknown> = []
    const onUnhandled = (reason: unknown) => unhandled.push(reason)
    process.on('unhandledRejection', onUnhandled)
    try {
      const controller = new AbortController()
      const { connection, serverSends } = await connectLive(undefined, {
        abortSignal: controller.signal,
      })

      // RealtimeClient.disconnect() aborts the connect signal, then closes.
      controller.abort()
      const closing = connection.disconnect()
      serverSends({ type: 'session.closed', reason: 'close_requested' })
      await closing
      await nextTask()
      await nextTask()

      expect(unhandled).toEqual([])
    } finally {
      process.off('unhandledRejection', onUnhandled)
    }
  })

  it('removes its abort listeners once connect returns', async () => {
    const controller = new AbortController()
    const added = vi.spyOn(controller.signal, 'addEventListener')
    const removed = vi.spyOn(controller.signal, 'removeEventListener')

    await connectLive(undefined, { abortSignal: controller.signal })
    await nextTask()

    const removedListeners = removed.mock.calls.map(([, listener]) => listener)
    const leftListeners = added.mock.calls
      .map(([, listener]) => listener)
      .filter((listener) => !removedListeners.includes(listener))
    expect(added).toHaveBeenCalled()
    expect(leftListeners).toEqual([])
  })

  it('opens the microphone on startAudioCapture when autoCapture is false', async () => {
    const { connection, getUserMedia, sentTypes } = await connectLive(
      undefined,
      { autoCapture: false },
    )
    expect(getUserMedia).not.toHaveBeenCalled()

    await connection.startAudioCapture()

    expect(getUserMedia).toHaveBeenCalledTimes(1)
    expect(sentTypes()).toEqual(['session.input_audio.unmute'])
  })

  it('logs on sendImage', async () => {
    const { connection } = await connectLive()

    expect(() => connection.sendImage('abc', 'image/png')).not.toThrow()
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('openai.live sendImage not supported'),
      { source: 'openai.live' },
    )
  })
})
