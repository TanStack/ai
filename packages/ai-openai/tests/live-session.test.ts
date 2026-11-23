import { afterEach, describe, expect, it, vi } from 'vitest'
import { openaiLiveSession } from '../src/realtime/live-session'
import type { RealtimeSessionConfig } from '@tanstack/ai'
import type { OpenAILiveSessionOptions } from '../src/realtime/live-types'

const okBody = {
  session: { id: 'sess_123' },
  transport: { type: 'webrtc', sdp: 'v=0 answer' },
}

const weatherTool = {
  name: 'get_weather',
  description: 'Get the weather for a city',
  inputSchema: {
    type: 'object',
    properties: { city: { type: 'string' } },
    required: ['city'],
  },
}

function stubFetch(response: Response) {
  const fetchMock = vi.fn((_url: string, _init: RequestInit) =>
    Promise.resolve(response),
  )
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

async function createSessionWith(
  options: OpenAILiveSessionOptions,
  config: RealtimeSessionConfig,
  response: Response = Response.json(okBody, { status: 201 }),
) {
  const fetchMock = stubFetch(response)
  const answer = await openaiLiveSession({
    apiKey: 'sk-test',
    ...options,
  }).createSession({ sdp: 'v=0 offer', config })
  const [url, init] = fetchMock.mock.calls[0] ?? []
  return { answer, url, init, body: JSON.parse(String(init?.body)) }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('openaiLiveSession', () => {
  it('server instructions and voice win over the client', async () => {
    const { answer, url, init, body } = await createSessionWith(
      { instructions: 'server', voice: 'quartz' },
      { instructions: 'client', voice: 'marin' },
    )

    expect(url).toBe('https://api.openai.com/v1/live/sessions')
    expect(init?.headers).toEqual({
      Authorization: 'Bearer sk-test',
      'Content-Type': 'application/json',
    })
    expect(body).toEqual({
      session: {
        model: 'gpt-live-1.1',
        instructions: 'server',
        audio: { output: { voice: 'quartz' } },
        delegation: null,
      },
      transport: { type: 'webrtc', sdp: 'v=0 offer' },
    })
    expect(answer).toEqual({
      provider: 'openai',
      sessionId: 'sess_123',
      sdp: 'v=0 answer',
      config: {
        model: 'gpt-live-1.1',
        instructions: 'server',
        voice: 'quartz',
      },
    })
  })

  it('client instructions are used when the server sets none', async () => {
    const { body } = await createSessionWith({}, { instructions: 'client' })

    expect(body.session.instructions).toBe('client')
  })

  it('client tools go into delegation.responses.tools', async () => {
    const { body, answer } = await createSessionWith(
      {
        delegation: {
          model: 'gpt-5.5',
          toolChoice: 'auto',
          parallelToolCalls: true,
          maxOutputTokens: 512,
        },
      },
      { tools: [weatherTool] },
    )

    expect(body.session.delegation).toEqual({
      type: 'responses',
      responses: {
        model: 'gpt-5.5',
        tools: [
          {
            type: 'function',
            name: 'get_weather',
            description: 'Get the weather for a city',
            parameters: {
              type: 'object',
              properties: { city: { type: 'string' } },
              required: ['city'],
              additionalProperties: false,
            },
            strict: true,
          },
        ],
        tool_choice: 'auto',
        parallel_tool_calls: true,
        max_output_tokens: 512,
      },
    })
    expect(answer.config.tools).toEqual([weatherTool])
  })

  it('throws when the client sends tools and no delegation is set', async () => {
    const fetchMock = stubFetch(Response.json(okBody, { status: 201 }))

    await expect(
      openaiLiveSession({ apiKey: 'sk-test' }).createSession({
        sdp: 'v=0 offer',
        config: { tools: [weatherTool] },
      }),
    ).rejects.toThrow(/no `delegation` is set/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('throws with status and body text on a non-2xx response', async () => {
    await expect(
      createSessionWith(
        {},
        {},
        new Response('{"error":"bad model"}', { status: 400 }),
      ),
    ).rejects.toThrow(
      'OpenAI live session creation failed: 400 {"error":"bad model"}',
    )
  })

  it('throws when transport.sdp is missing', async () => {
    await expect(
      createSessionWith(
        {},
        {},
        Response.json(
          { session: { id: 'sess_123' }, transport: {} },
          {
            status: 201,
          },
        ),
      ),
    ).rejects.toThrow(/missing `session.id` or `transport.sdp`/)
  })

  it('defaults to gpt-live-1.1', async () => {
    const { body, answer } = await createSessionWith({}, {})

    expect(body.session.model).toBe('gpt-live-1.1')
    expect(answer.config.model).toBe('gpt-live-1.1')
  })
})
