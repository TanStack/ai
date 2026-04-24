import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { realtimeToken } from '@tanstack/ai'
import { grokRealtimeToken } from '../src/realtime/token'

const originalFetch = globalThis.fetch
const originalXaiApiKey = process.env.XAI_API_KEY

beforeEach(() => {
  process.env.XAI_API_KEY = 'xai-test'
})

afterEach(() => {
  globalThis.fetch = originalFetch
  vi.restoreAllMocks()
  if (originalXaiApiKey === undefined) {
    delete process.env.XAI_API_KEY
  } else {
    process.env.XAI_API_KEY = originalXaiApiKey
  }
})

function makeSessionResponse(expiresAt: number) {
  return {
    ok: true,
    status: 200,
    json: () =>
      Promise.resolve({
        id: 'sess_1',
        object: 'realtime.session',
        model: 'grok-voice-fast-1.0',
        modalities: ['audio', 'text'],
        instructions: '',
        voice: 'eve',
        input_audio_format: 'pcm16',
        output_audio_format: 'pcm16',
        input_audio_transcription: { model: 'grok-stt' },
        turn_detection: null,
        tools: [],
        tool_choice: 'auto',
        temperature: 0.7,
        max_response_output_tokens: 4096,
        client_secret: {
          value: 'ephemeral-token',
          expires_at: expiresAt,
        },
      }),
    text: () => Promise.resolve(''),
  } as Partial<Response> as Response
}

describe('grokRealtimeToken request body', () => {
  it('wraps the model under the `session` key per xAI /v1/realtime/client_secrets schema', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(makeSessionResponse(1_700_000_000))
    globalThis.fetch = fetchMock as unknown as typeof fetch

    await realtimeToken({
      adapter: grokRealtimeToken({ model: 'grok-voice-think-fast-1.0' }),
    })

    const init = fetchMock.mock.calls[0]![1]!
    const body = JSON.parse(init.body as string) as Record<string, unknown>
    expect(body).toEqual({ session: { model: 'grok-voice-think-fast-1.0' } })
  })
})

describe('grokRealtimeToken expires_at unit-safety', () => {
  it('treats a seconds timestamp as seconds (*1000)', async () => {
    const seconds = 1_700_000_000 // 2023-11-14 in seconds
    globalThis.fetch = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        makeSessionResponse(seconds),
      ) as unknown as typeof fetch

    const token = await realtimeToken({ adapter: grokRealtimeToken() })

    expect(token.expiresAt).toBe(seconds * 1000)
  })

  it('treats an already-millisecond timestamp (>1e12) as-is', async () => {
    const ms = 1_700_000_000_000 // already in ms
    globalThis.fetch = vi
      .fn<typeof fetch>()
      .mockResolvedValue(makeSessionResponse(ms)) as unknown as typeof fetch

    const token = await realtimeToken({ adapter: grokRealtimeToken() })

    expect(token.expiresAt).toBe(ms)
  })
})
