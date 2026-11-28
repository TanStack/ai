import { afterEach, describe, expect, it, vi } from 'vitest'
import { createRealtimeEventEmitter, toolDefinition } from '@tanstack/ai'
import { RealtimeClient } from '../src'
import type {
  RealtimeAdapter,
  RealtimeConnectOptions,
  RealtimeConnection,
  RealtimeRelayAdapter,
  RealtimeSessionAnswer,
  RealtimeSessionRequest,
  RealtimeToken,
} from '@tanstack/ai/client'

const weatherDefinition = toolDefinition({
  name: 'getWeather',
  description: 'Get the weather for a city',
  inputSchema: {
    type: 'object',
    properties: { city: { type: 'string' } },
    required: ['city'],
  },
})
const weatherTool = weatherDefinition.client(async () => 'sunny')

const clientConfig = {
  instructions: 'Answer in one sentence.',
  voice: 'marin',
  tools: [weatherTool],
  autoCapture: false,
}

const answer: RealtimeSessionAnswer = {
  provider: 'test',
  sessionId: 'session-1',
  sdp: 'answer-sdp',
  config: {},
}

const token: RealtimeToken = {
  provider: 'test',
  token: 't',
  expiresAt: Date.now() + 3_600_000,
  config: {},
}

function fakeConnection() {
  const updateSession = vi.fn<RealtimeConnection['updateSession']>()
  const sendToolResult = vi.fn<RealtimeConnection['sendToolResult']>()
  const { emit, on } = createRealtimeEventEmitter()
  const connection: RealtimeConnection = {
    disconnect: async () => {},
    startAudioCapture: async () => {},
    stopAudioCapture: () => {},
    sendText: () => {},
    sendImage: () => {},
    sendToolResult,
    updateSession,
    interrupt: () => {},
    on,
    getAudioVisualization: () => ({
      inputLevel: 0,
      outputLevel: 0,
      getInputFrequencyData: () => new Uint8Array(),
      getOutputFrequencyData: () => new Uint8Array(),
      getInputTimeDomainData: () => new Uint8Array(),
      getOutputTimeDomainData: () => new Uint8Array(),
      inputSampleRate: 0,
      outputSampleRate: 0,
    }),
  }
  return { connection, updateSession, sendToolResult, emit }
}

/** A relay adapter that makes the offer `offer-sdp` and needs an answer. */
function relayClient() {
  const { connection, updateSession } = fakeConnection()
  const answers: Array<RealtimeSessionAnswer> = []
  const connectOptions: Array<RealtimeConnectOptions | undefined> = []
  const adapter: RealtimeRelayAdapter = {
    provider: 'test',
    kind: 'relay',
    connect: async (createSession, _tools, options) => {
      connectOptions.push(options)
      answers.push(await createSession({ sdp: 'offer-sdp' }))
      return connection
    },
  }
  const createSession = vi.fn(
    async (_request: RealtimeSessionRequest) => answer,
  )
  const client = new RealtimeClient({
    ...clientConfig,
    adapter,
    createSession,
  })
  return { client, createSession, updateSession, answers, connectOptions }
}

/**
 * A token client with a slow `getWeather` tool. The adapter gives `first` on
 * the first connect and `second` after that. `settleTool` ends the tool call.
 */
type ToolOutcome = { output: string } | { error: Error }

function slowToolClient() {
  const first = fakeConnection()
  const second = fakeConnection()
  let settleTool: (outcome: ToolOutcome) => void = () => {}
  const slowWeatherTool = weatherDefinition.client(
    () =>
      new Promise<string>((resolve, reject) => {
        settleTool = (outcome) =>
          'output' in outcome ? resolve(outcome.output) : reject(outcome.error)
      }),
  )
  let connects = 0
  const client = new RealtimeClient({
    ...clientConfig,
    tools: [slowWeatherTool],
    adapter: {
      provider: 'test',
      connect: async () => (++connects === 1 ? first : second).connection,
    },
    getToken: async () => token,
  })
  return {
    client,
    first,
    second,
    settle: (outcome: ToolOutcome) => settleTool(outcome),
  }
}

/** Lets the tool callback of the client run to its end. */
const flushToolCallback = () => new Promise((resolve) => setTimeout(resolve, 0))

const toolCall = {
  toolCallId: 'call-1',
  toolName: 'getWeather',
  input: { city: 'Paris' },
}

afterEach(() => {
  vi.useRealTimers()
})

describe('RealtimeClient relay connect', () => {
  it('relay connect sends the client config with the offer', async () => {
    const { client, createSession, answers } = relayClient()

    await client.connect()

    expect(createSession).toHaveBeenCalledTimes(1)
    expect(createSession).toHaveBeenCalledWith(
      {
        sdp: 'offer-sdp',
        config: {
          instructions: 'Answer in one sentence.',
          voice: 'marin',
          vadMode: 'server',
          tools: [
            {
              name: 'getWeather',
              description: 'Get the weather for a city',
              inputSchema: {
                type: 'object',
                properties: { city: { type: 'string' } },
                required: ['city'],
              },
            },
          ],
        },
      },
      expect.any(AbortSignal),
    )
    expect(answers).toEqual([answer])
    expect(client.getSnapshot().status).toBe('connected')
    client.destroy()
  })

  it('drops the connection when the session goes idle', async () => {
    const { connection, emit } = fakeConnection()
    const onDisconnect = vi.fn()
    let connects = 0
    const client = new RealtimeClient({
      ...clientConfig,
      onDisconnect,
      adapter: {
        provider: 'test',
        kind: 'relay',
        connect: async (createSession) => {
          connects += 1
          await createSession({ sdp: 'offer-sdp' })
          return connection
        },
      },
      createSession: async () => answer,
    })

    await client.connect()
    emit('status_change', { status: 'idle' })

    expect(onDisconnect).toHaveBeenCalledTimes(1)
    expect(client.status).toBe('idle')
    expect(Reflect.get(client, 'connection')).toBeNull()

    await client.connect()
    expect(connects).toBe(2)
    expect(onDisconnect).toHaveBeenCalledTimes(1)
    await client.disconnect()
    expect(onDisconnect).toHaveBeenCalledTimes(2)
  })

  it('stays connected and idle when the microphone is denied', async () => {
    const { connection } = fakeConnection()
    connection.startAudioCapture = async () => {
      throw new Error('Permission denied')
    }
    const onError = vi.fn()
    const client = new RealtimeClient({
      ...clientConfig,
      onError,
      adapter: { provider: 'test', connect: async () => connection },
      getToken: async () => token,
    })

    await client.connect()
    client.startListening()
    await vi.waitFor(() => expect(onError).toHaveBeenCalledTimes(1))

    expect(client.mode).toBe('idle')
    expect(client.status).toBe('connected')
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Permission denied' }),
    )
    client.destroy()
  })

  it('does not mark listening when stopListening wins the microphone prompt', async () => {
    const { connection } = fakeConnection()
    let grant = () => {}
    connection.startAudioCapture = () =>
      new Promise<void>((resolve) => {
        grant = resolve
      })
    const client = new RealtimeClient({
      ...clientConfig,
      adapter: { provider: 'test', connect: async () => connection },
      getToken: async () => token,
    })

    await client.connect()
    client.startListening()
    client.stopListening()
    grant()
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(client.mode).toBe('idle')
    client.destroy()
  })

  it('relay updateSession forwards only the changed fields, with providerOptions', async () => {
    const { client, updateSession } = relayClient()
    await client.connect()

    const delegation = { model: 'gpt-6.1-terra', toolChoice: 'auto' }
    client.updateSession({ providerOptions: { delegation } })

    expect(updateSession).toHaveBeenCalledTimes(1)
    expect(updateSession.mock.calls[0]?.[0]).toEqual({
      providerOptions: { delegation },
    })
    client.destroy()
  })

  it('relay sends setup changes before a subscriber can send a newer one', async () => {
    const { connection, updateSession } = fakeConnection()
    let finishSetup = () => {}
    let setupDone = false
    const adapter: RealtimeRelayAdapter = {
      provider: 'test',
      kind: 'relay',
      connect: async (createSession) => {
        await createSession({ sdp: 'offer-sdp' })
        await new Promise<void>((resolve) => (finishSetup = resolve))
        return connection
      },
    }
    const createSession = vi.fn(
      async (_request: RealtimeSessionRequest) => answer,
    )
    const client = new RealtimeClient({
      ...clientConfig,
      adapter,
      createSession,
    })
    let sentNewer = false
    client.onStateChange(() => {
      if (!setupDone || sentNewer) return
      sentNewer = true
      client.updateSession({ instructions: 'newer' })
    })

    const connecting = client.connect()
    await vi.waitFor(() => expect(createSession).toHaveBeenCalled())
    client.updateSession({ instructions: 'during setup' })
    setupDone = true
    finishSetup()
    await connecting

    expect(updateSession.mock.calls.map(([config]) => config)).toEqual([
      { instructions: 'during setup' },
      { instructions: 'newer' },
    ])
    client.destroy()
  })

  it('a failed older connect keeps the setup changes of the newer one', async () => {
    const { connection, updateSession } = fakeConnection()
    let failFirst = () => {}
    let finishSecond = () => {}
    let attempt = 0
    const adapter: RealtimeRelayAdapter = {
      provider: 'test',
      kind: 'relay',
      connect: async (createSession) => {
        attempt += 1
        const isFirst = attempt === 1
        await createSession({ sdp: 'offer-sdp' })
        await new Promise<void>((resolve, reject) => {
          if (isFirst) failFirst = () => reject(new Error('setup failed'))
          else finishSecond = resolve
        })
        return connection
      },
    }
    const createSession = vi.fn(
      async (_request: RealtimeSessionRequest) => answer,
    )
    const client = new RealtimeClient({
      ...clientConfig,
      adapter,
      createSession,
    })

    const first = client.connect()
    await vi.waitFor(() => expect(createSession).toHaveBeenCalledTimes(1))
    const second = client.connect()
    await vi.waitFor(() => expect(createSession).toHaveBeenCalledTimes(2))
    client.updateSession({ instructions: 'for the second' })
    failFirst()
    await expect(first).rejects.toThrow('setup failed')
    finishSecond()
    await second

    expect(updateSession).toHaveBeenCalledWith({
      instructions: 'for the second',
    })
    client.destroy()
  })

  it('relay sends an updateSession change made during setup once, after connect', async () => {
    const { connection, updateSession } = fakeConnection()
    let finishSetup = () => {}
    const adapter: RealtimeRelayAdapter = {
      provider: 'test',
      kind: 'relay',
      connect: async (createSession) => {
        await createSession({ sdp: 'offer-sdp' })
        await new Promise<void>((resolve) => (finishSetup = resolve))
        return connection
      },
    }
    const createSession = vi.fn(
      async (_request: RealtimeSessionRequest) => answer,
    )
    const client = new RealtimeClient({
      ...clientConfig,
      adapter,
      createSession,
    })

    const connecting = client.connect()
    await vi.waitFor(() => expect(createSession).toHaveBeenCalled())
    client.updateSession({ instructions: 'Answer in French.' })
    finishSetup()
    await connecting

    expect(updateSession).toHaveBeenCalledTimes(1)
    expect(updateSession.mock.calls[0]?.[0]).toEqual({
      instructions: 'Answer in French.',
    })
    client.destroy()
  })

  it('relay connect does not call updateSession after connect', async () => {
    const { client, updateSession } = relayClient()

    await client.connect()

    expect(client.getSnapshot().status).toBe('connected')
    expect(updateSession).not.toHaveBeenCalled()
    client.destroy()
  })

  it('relay connect passes autoCapture: false to the adapter', async () => {
    const { client, connectOptions } = relayClient()

    await client.connect()

    expect(connectOptions).toEqual([
      { abortSignal: expect.any(AbortSignal), autoCapture: false },
    ])
    client.destroy()
  })

  it('relay connect schedules no token refresh', async () => {
    vi.useFakeTimers()
    const { client } = relayClient()

    await client.connect()

    expect(client.getSnapshot().status).toBe('connected')
    expect(vi.getTimerCount()).toBe(0)
    client.destroy()
  })
})

describe('RealtimeClient token connect', () => {
  it('token adapters still use getToken', async () => {
    vi.useFakeTimers()
    const { connection, updateSession } = fakeConnection()
    const tokens: Array<RealtimeToken> = []
    const adapter: RealtimeAdapter = {
      provider: 'test',
      connect: async (receivedToken) => {
        tokens.push(receivedToken)
        return connection
      },
    }
    const getToken = vi.fn(async () => token)
    const client = new RealtimeClient({ ...clientConfig, adapter, getToken })

    await client.connect()

    expect(getToken).toHaveBeenCalledTimes(1)
    expect(tokens).toEqual([token])
    expect(updateSession).toHaveBeenCalledTimes(1)
    expect(updateSession.mock.calls[0]?.[0]).toMatchObject({
      instructions: 'Answer in one sentence.',
      voice: 'marin',
    })
    // One timer: the token refresh.
    expect(vi.getTimerCount()).toBe(1)
    client.destroy()
  })

  it('token connect passes autoCapture: false to the adapter', async () => {
    const { connection } = fakeConnection()
    const connectOptions: Array<RealtimeConnectOptions | undefined> = []
    const client = new RealtimeClient({
      ...clientConfig,
      adapter: {
        provider: 'test',
        connect: async (_token, _tools, options) => {
          connectOptions.push(options)
          return connection
        },
      },
      getToken: async () => token,
    })

    await client.connect()

    expect(connectOptions).toEqual([
      { abortSignal: expect.any(AbortSignal), autoCapture: false },
    ])
    client.destroy()
  })

  it('token updateSession sends providerOptions with the full config', async () => {
    const { connection, updateSession } = fakeConnection()
    const client = new RealtimeClient({
      ...clientConfig,
      adapter: { provider: 'test', connect: async () => connection },
      getToken: async () => token,
    })
    await client.connect()
    updateSession.mockClear()

    client.updateSession({ providerOptions: { inputAudioTranscription: null } })

    expect(updateSession.mock.calls[0]?.[0]).toMatchObject({
      instructions: 'Answer in one sentence.',
      providerOptions: { inputAudioTranscription: null },
    })
    client.destroy()
  })
})

describe('RealtimeClient tool results', () => {
  const outcomes: Array<{ name: string; outcome: ToolOutcome; sent: string }> =
    [
      { name: 'result', outcome: { output: 'sunny' }, sent: 'sunny' },
      {
        name: 'error result',
        outcome: { error: new Error('no weather') },
        sent: JSON.stringify({ error: 'no weather' }),
      },
    ]

  it.each(outcomes)(
    'sends the $name to the connection that asked for it',
    async ({ outcome, sent }) => {
      const { client, first, settle } = slowToolClient()
      await client.connect()

      first.emit('tool_call', toolCall)
      settle(outcome)
      await flushToolCallback()

      expect(first.sendToolResult.mock.calls).toEqual([['call-1', sent]])
      client.destroy()
    },
  )

  it.each(outcomes)(
    'drops the $name of a call from a session replaced by a reconnect',
    async ({ outcome }) => {
      const { client, first, second, settle } = slowToolClient()
      await client.connect()
      first.emit('tool_call', toolCall)

      await client.disconnect()
      await client.connect()
      settle(outcome)
      await flushToolCallback()

      expect(first.sendToolResult).not.toHaveBeenCalled()
      expect(second.sendToolResult).not.toHaveBeenCalled()
      client.destroy()
    },
  )
})
