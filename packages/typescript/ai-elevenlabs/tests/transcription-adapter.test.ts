import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { generateTranscription } from '@tanstack/ai'

import { elevenlabsTranscription } from '../src/adapters/transcription'

const ORIGINAL_FETCH = globalThis.fetch

describe('ElevenLabs Transcription Adapter', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    process.env.ELEVENLABS_API_KEY = 'test-key'
    fetchMock = vi.fn()
    globalThis.fetch = fetchMock as unknown as typeof fetch
  })

  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH
    delete process.env.ELEVENLABS_API_KEY
  })

  it('posts file audio and returns mapped segments/words', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          transcription_id: 'tx_1',
          text: 'hello world',
          language_code: 'en',
          audio_duration_secs: 1.2,
          words: [
            {
              text: 'hello',
              start: 0,
              end: 0.4,
              type: 'word',
              speaker_id: 'spk_0',
            },
            {
              text: ' ',
              start: 0.4,
              end: 0.5,
              type: 'spacing',
              speaker_id: 'spk_0',
            },
            {
              text: 'world',
              start: 0.5,
              end: 1.2,
              type: 'word',
              speaker_id: 'spk_1',
            },
          ],
        }),
        {
          headers: { 'content-type': 'application/json' },
        },
      ),
    )

    const adapter = elevenlabsTranscription('scribe_v2')
    const result = await generateTranscription({
      adapter,
      audio: new ArrayBuffer(4),
      language: 'en',
      modelOptions: { diarize: true, keyterms: ['world'] },
    })

    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toContain('/v1/speech-to-text')
    const body = (init as RequestInit).body as FormData
    expect(body.get('model_id')).toBe('scribe_v2')
    expect(body.get('language_code')).toBe('en')
    expect(body.get('diarize')).toBe('true')
    expect(body.get('keyterms')).toBe('["world"]')
    expect(body.get('file')).toBeInstanceOf(Blob)

    expect(result.id).toBe('tx_1')
    expect(result.text).toBe('hello world')
    expect(result.duration).toBe(1.2)
    expect(result.words).toHaveLength(2)
    expect(result.segments).toHaveLength(2)
    expect(result.segments![0]).toMatchObject({
      start: 0,
      end: 0.5,
      speaker: 'spk_0',
    })
    expect(result.segments![1]).toMatchObject({
      speaker: 'spk_1',
      text: 'world',
    })
  })

  it('forwards http URLs as cloud_storage_url', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          text: 'ok',
          language_code: 'en',
          audio_duration_secs: 0.1,
          words: [],
        }),
        { headers: { 'content-type': 'application/json' } },
      ),
    )

    const adapter = elevenlabsTranscription('scribe_v2')
    await generateTranscription({
      adapter,
      audio: 'https://example.com/audio.mp3',
    })

    const [, init] = fetchMock.mock.calls[0]!
    const body = (init as RequestInit).body as FormData
    expect(body.get('cloud_storage_url')).toBe('https://example.com/audio.mp3')
    expect(body.get('file')).toBeNull()
  })
})
