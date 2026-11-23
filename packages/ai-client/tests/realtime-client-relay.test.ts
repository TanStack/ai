import { afterEach, describe, expect, it, vi } from 'vitest'
import { toolDefinition } from '@tanstack/ai'
import { RealtimeClient } from '../src'
import type {
  RealtimeAdapter,
  RealtimeConnection,
  RealtimeRelayAdapter,
  RealtimeSessionAnswer,
  RealtimeSessionRequest,
  RealtimeToken,
} from '@tanstack/ai/client'

const weatherTool = toolDefinition({
  name: 'getWeather',
  description: 'Get the weather for a city',
  inputSchema: {
    type: 'object',
    properties: { city: { type: 'string' } },
    required: ['city'],
  },
}).client(async () => 'sunny')

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
  const connection: RealtimeConnection = {
    disconnect: async () => {},
    startAudioCapture: async () => {},
    stopAudioCapture: () => {},
    sendText: () => {},
    sendImage: () => {},
    sendToolResult: () => {},
    updateSession,
    interrupt: () => {},
    on: () => () => {},
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
  return { connection, updateSession }
}

/** A relay adapter that makes the offer `offer-sdp` and needs an answer. */
function relayClient() {
  const { connection, updateSession } = fakeConnection()
  const answers: Array<RealtimeSessionAnswer> = []
  const adapter: RealtimeRelayAdapter = {
    provider: 'test',
    kind: 'relay',
    connect: async (createSession) => {
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
  return { client, createSession, updateSession, answers }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('RealtimeClient relay connect', () => {
  it('relay connect sends the client config with the offer', async () => {
    const { client, createSession, answers } = relayClient()

    await client.connect()

    expect(createSession).toHaveBeenCalledTimes(1)
    expect(createSession).toHaveBeenCalledWith({
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
    })
    expect(answers).toEqual([answer])
    expect(client.getSnapshot().status).toBe('connected')
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
