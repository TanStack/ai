import { describe, expect, it } from 'vitest'
import { createElevenLabsClient } from '../src/client'

// These calls go through the generated ElevenLabs operations.
function recordingFetch(response: () => Response) {
  const calls: Array<{ url: string; init: RequestInit }> = []
  const fetch = async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} })
    return await Promise.resolve(response())
  }
  return { calls, fetch }
}

describe('generated ElevenLabs client', () => {
  it('sends a JSON voice design call and parses the body', async () => {
    const { calls, fetch } = recordingFetch(() =>
      Response.json({ previews: [], text: 'Hi' }),
    )
    const client = createElevenLabsClient({ apiKey: 'k', fetch })

    const result = await client.textToVoice.design(
      { voice_description: 'A calm narrator' },
      { output_format: 'mp3_44100_128' },
    )

    expect(result).toMatchObject({ text: 'Hi' })
    expect(calls[0]?.url).toBe(
      'https://api.elevenlabs.io/v1/text-to-voice/design?output_format=mp3_44100_128',
    )
    expect(calls[0]?.init.method).toBe('POST')
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({
      voice_description: 'A calm narrator',
    })
    const headers = new Headers(calls[0]?.init.headers)
    expect(headers.get('content-type')).toBe('application/json')
    expect(headers.get('xi-api-key')).toBe('k')
  })

  it('sends text to speech and reads the audio bytes', async () => {
    const audio = new Uint8Array([1, 2, 3])
    const { calls, fetch } = recordingFetch(
      () => new Response(audio, { headers: { 'content-type': 'audio/mpeg' } }),
    )
    const client = createElevenLabsClient({ apiKey: 'k', fetch })

    const stream = await client.textToSpeech.convert('voice/1', {
      text: 'Hello',
      model_id: 'eleven_v3',
    })

    const bytes = new Uint8Array(await new Response(stream).arrayBuffer())
    expect(Array.from(bytes)).toEqual([1, 2, 3])
    expect(calls[0]?.url).toBe(
      'https://api.elevenlabs.io/v1/text-to-speech/voice%2F1',
    )
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({
      text: 'Hello',
      model_id: 'eleven_v3',
    })
  })
})
