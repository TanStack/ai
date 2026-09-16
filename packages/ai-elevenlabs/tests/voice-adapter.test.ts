import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'

const designMock = vi.fn()
const createMock = vi.fn()

vi.mock('@elevenlabs/elevenlabs-js', () => ({
  ElevenLabsClient: class {
    textToVoice = { design: designMock, create: createMock }
  },
}))

import { elevenlabsVoiceDesign } from '../src/adapters/voice'

function makeLogger() {
  return resolveDebugOption(false)
}

function makePreviews() {
  return {
    text: 'The quick brown fox jumps over the lazy dog.',
    previews: [
      {
        generatedVoiceId: 'gen-1',
        audioBase64: 'AAAA',
        mediaType: 'audio/mpeg',
        durationSecs: 4.2,
        language: 'en',
      },
      {
        generatedVoiceId: 'gen-2',
        audioBase64: 'BBBB',
        mediaType: 'audio/mpeg',
        durationSecs: 4.1,
      },
    ],
  }
}

describe('elevenlabsVoiceDesign adapter', () => {
  beforeEach(() => {
    designMock.mockReset()
    createMock.mockReset()
  })

  it('designs previews and reports them as unsaved voices', async () => {
    designMock.mockResolvedValue(makePreviews())
    const adapter = elevenlabsVoiceDesign('eleven_ttv_v3', { apiKey: 'k' })

    const result = await adapter.generateVoice({
      model: 'eleven_ttv_v3',
      prompt: 'A warm, gravelly narrator in his sixties',
      logger: makeLogger(),
    })

    expect(createMock).not.toHaveBeenCalled()
    expect(designMock.mock.calls[0]![0]).toMatchObject({
      voiceDescription: 'A warm, gravelly narrator in his sixties',
      modelId: 'eleven_ttv_v3',
    })
    expect(result.previewText).toBe(
      'The quick brown fox jumps over the lazy dog.',
    )
    expect(result.voices).toEqual([
      {
        voiceId: 'gen-1',
        audio: 'AAAA',
        format: 'mp3',
        contentType: 'audio/mpeg',
        duration: 4.2,
        language: 'en',
        saved: false,
        status: 'ready',
      },
      {
        voiceId: 'gen-2',
        audio: 'BBBB',
        format: 'mp3',
        contentType: 'audio/mpeg',
        duration: 4.1,
        saved: false,
        status: 'ready',
      },
    ])
  })

  it('promotes the first preview when a name is given', async () => {
    designMock.mockResolvedValue(makePreviews())
    createMock.mockResolvedValue({ voiceId: 'saved-voice' })
    const adapter = elevenlabsVoiceDesign('eleven_ttv_v3', { apiKey: 'k' })

    const result = await adapter.generateVoice({
      model: 'eleven_ttv_v3',
      prompt: 'A bright, upbeat product demo host',
      name: 'Demo Host',
      description: 'Bright, upbeat, mid-30s',
      modelOptions: { labels: { use_case: 'demo' } },
      logger: makeLogger(),
    })

    expect(createMock.mock.calls[0]![0]).toMatchObject({
      voiceName: 'Demo Host',
      voiceDescription: 'Bright, upbeat, mid-30s',
      generatedVoiceId: 'gen-1',
      labels: { use_case: 'demo' },
      // Losing candidates go back as RLHF signal.
      playedNotSelectedVoiceIds: ['gen-2'],
    })
    expect(result.voices[0]).toMatchObject({
      voiceId: 'saved-voice',
      saved: true,
    })
    expect(result.voices[1]).toMatchObject({ voiceId: 'gen-2', saved: false })
  })

  it('falls back to the prompt as the stored description', async () => {
    designMock.mockResolvedValue(makePreviews())
    createMock.mockResolvedValue({ voiceId: 'saved-voice' })
    const adapter = elevenlabsVoiceDesign('eleven_ttv_v3', { apiKey: 'k' })

    await adapter.generateVoice({
      model: 'eleven_ttv_v3',
      prompt: 'A calm meditation guide',
      name: 'Guide',
      logger: makeLogger(),
    })

    expect(createMock.mock.calls[0]![0]).toMatchObject({
      voiceDescription: 'A calm meditation guide',
    })
  })

  it('maps every provider option onto its wire field', async () => {
    designMock.mockResolvedValue(makePreviews())
    const adapter = elevenlabsVoiceDesign('eleven_ttv_v3', { apiKey: 'k' })

    await adapter.generateVoice({
      model: 'eleven_ttv_v3',
      prompt: 'A warm, gravelly narrator',
      logger: makeLogger(),
      modelOptions: {
        outputFormat: 'opus_48000_128',
        text: 'A line the previews speak.',
        autoGenerateText: false,
        // Zero has to survive: a truthiness guard would drop these.
        loudness: 0,
        seed: 0,
        guidanceScale: 0,
        quality: 0,
        shouldEnhance: false,
        promptStrength: 0,
        remixingSessionId: 'sess-1',
        remixingSessionIterationId: 'iter-1',
      },
    })

    expect(designMock.mock.calls[0]![0]).toMatchObject({
      outputFormat: 'opus_48000_128',
      text: 'A line the previews speak.',
      autoGenerateText: false,
      loudness: 0,
      seed: 0,
      guidanceScale: 0,
      quality: 0,
      shouldEnhance: false,
      promptStrength: 0,
      remixingSessionId: 'sess-1',
      remixingSessionIterationId: 'iter-1',
    })
  })

  it('derives format and contentType from the requested outputFormat', async () => {
    designMock.mockResolvedValue({
      text: 'A line.',
      previews: [{ generatedVoiceId: 'gen-1', audioBase64: 'AAAA' }],
    })
    const adapter = elevenlabsVoiceDesign('eleven_ttv_v3', { apiKey: 'k' })

    const result = await adapter.generateVoice({
      model: 'eleven_ttv_v3',
      prompt: 'A warm, gravelly narrator',
      logger: makeLogger(),
      modelOptions: { outputFormat: 'opus_48000_128' },
    })

    // No mediaType on the preview, so the requested format is the fallback.
    expect(result.voices[0]).toMatchObject({
      format: 'opus',
      contentType: 'audio/opus',
    })
  })

  it('forwards the abort signal to both SDK calls', async () => {
    designMock.mockResolvedValue(makePreviews())
    createMock.mockResolvedValue({ voiceId: 'saved-voice' })
    const adapter = elevenlabsVoiceDesign('eleven_ttv_v3', { apiKey: 'k' })
    const abort = new AbortController()

    await adapter.generateVoice({
      model: 'eleven_ttv_v3',
      prompt: 'A warm, gravelly narrator',
      name: 'Narrator',
      logger: makeLogger(),
      abortSignal: abort.signal,
    })

    // Without this the request keeps running after the caller gave up — and
    // the create half would still persist a voice.
    expect(designMock.mock.calls[0]![1]).toEqual({ abortSignal: abort.signal })
    expect(createMock.mock.calls[0]![1]).toEqual({ abortSignal: abort.signal })
  })

  it('throws rather than reporting success when no previews come back', async () => {
    designMock.mockResolvedValue({ text: 'A line.', previews: [] })
    const adapter = elevenlabsVoiceDesign('eleven_ttv_v3', { apiKey: 'k' })

    await expect(
      adapter.generateVoice({
        model: 'eleven_ttv_v3',
        prompt: 'A warm, gravelly narrator',
        name: 'Narrator',
        logger: makeLogger(),
      }),
    ).rejects.toThrow(/no voice previews/i)
    expect(createMock).not.toHaveBeenCalled()
  })

  it('requires a prompt', async () => {
    const adapter = elevenlabsVoiceDesign('eleven_ttv_v3', { apiKey: 'k' })
    await expect(
      adapter.generateVoice({
        model: 'eleven_ttv_v3',
        referenceAudio: 'AAAA',
        logger: makeLogger(),
      }),
    ).rejects.toThrow(/requires a `prompt`/i)
    expect(designMock).not.toHaveBeenCalled()
  })

  describe('reference audio', () => {
    it('strips the data URL prefix', async () => {
      designMock.mockResolvedValue(makePreviews())
      const adapter = elevenlabsVoiceDesign('eleven_ttv_v3', { apiKey: 'k' })

      await adapter.generateVoice({
        model: 'eleven_ttv_v3',
        prompt: 'Like this speaker but younger',
        referenceAudio: 'data:audio/mpeg;base64,QUJD',
        logger: makeLogger(),
      })

      expect(designMock.mock.calls[0]![0]).toMatchObject({
        referenceAudioBase64: 'QUJD',
      })
    })

    it('encodes an ArrayBuffer', async () => {
      designMock.mockResolvedValue(makePreviews())
      const adapter = elevenlabsVoiceDesign('eleven_ttv_v3', { apiKey: 'k' })

      const bytes = new Uint8Array([65, 66, 67])
      await adapter.generateVoice({
        model: 'eleven_ttv_v3',
        prompt: 'Like this speaker but younger',
        referenceAudio: bytes.buffer,
        logger: makeLogger(),
      })

      expect(designMock.mock.calls[0]![0]).toMatchObject({
        referenceAudioBase64: 'QUJD',
      })
    })

    it('encodes a Blob', async () => {
      designMock.mockResolvedValue(makePreviews())
      const adapter = elevenlabsVoiceDesign('eleven_ttv_v3', { apiKey: 'k' })

      await adapter.generateVoice({
        model: 'eleven_ttv_v3',
        prompt: 'A warm, gravelly narrator',
        referenceAudio: new Blob([new Uint8Array([65, 66, 67])]),
        logger: makeLogger(),
      })

      expect(designMock.mock.calls[0]![0].referenceAudioBase64).toBe('QUJD')
    })

    it('rejects a data URL that is not base64', async () => {
      const adapter = elevenlabsVoiceDesign('eleven_ttv_v3', { apiKey: 'k' })

      await expect(
        adapter.generateVoice({
          model: 'eleven_ttv_v3',
          prompt: 'A warm, gravelly narrator',
          referenceAudio: 'data:audio/mpeg,raw-not-base64',
          logger: makeLogger(),
        }),
      ).rejects.toThrow(/needs base64 reference audio/i)
    })

    it('rejects a remote URL rather than downloading it', async () => {
      const adapter = elevenlabsVoiceDesign('eleven_ttv_v3', { apiKey: 'k' })
      await expect(
        adapter.generateVoice({
          model: 'eleven_ttv_v3',
          prompt: 'Like this speaker',
          referenceAudio: 'https://example.com/sample.mp3',
          logger: makeLogger(),
        }),
      ).rejects.toThrow(/does not accept reference audio URLs/i)
    })

    it('rejects models that cannot take reference audio', async () => {
      const adapter = elevenlabsVoiceDesign('eleven_multilingual_ttv_v2', {
        apiKey: 'k',
      })
      await expect(
        adapter.generateVoice({
          model: 'eleven_multilingual_ttv_v2',
          prompt: 'Like this speaker',
          referenceAudio: 'QUJD',
          logger: makeLogger(),
        }),
      ).rejects.toThrow(/only accepts reference audio on eleven_ttv_v3/i)
      expect(designMock).not.toHaveBeenCalled()
    })
  })
})
