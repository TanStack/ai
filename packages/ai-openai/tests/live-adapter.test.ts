import { afterEach, describe, expect, it, vi } from 'vitest'
import { openaiLive } from '../src/realtime/live-adapter'
import type {
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
  vi.stubGlobal('navigator', {
    mediaDevices: { getUserMedia: async () => stream },
  })
  vi.stubGlobal(
    'AudioContext',
    vi.fn(function AudioContext() {
      return {
        state: 'running',
        createAnalyser: () => ({ connect: vi.fn() }),
        createMediaStreamSource: () => ({ connect: vi.fn() }),
        close: async () => {},
      }
    }),
  )
  return { track, channel, pc }
}

const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }

/** Connect with fake globals and open the data channel. */
async function connectLive(
  createSession: RealtimeRelayCreateSession = async () => answer,
) {
  const browser = stubBrowser()
  const pending = openaiLive({ debug: { logger } }).connect(createSession)
  await vi.waitFor(() =>
    expect(browser.pc.setRemoteDescription).toHaveBeenCalled(),
  )
  browser.channel.readyState = 'open'
  browser.channel.onopen?.()
  const connection = await pending
  return {
    ...browser,
    connection,
    serverSends(event: object) {
      browser.channel.onmessage?.({ data: JSON.stringify(event) })
    },
    sentTypes() {
      return browser.channel.send.mock.calls.map(
        ([data]) => JSON.parse(String(data)).type,
      )
    },
  }
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
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('tool arguments are not valid JSON'),
      expect.objectContaining({ arguments: '{"city":' }),
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

  it('logs on sendImage', async () => {
    const { connection } = await connectLive()

    expect(() => connection.sendImage('abc', 'image/png')).not.toThrow()
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('openai.live sendImage not supported'),
      { source: 'openai.live' },
    )
  })
})
