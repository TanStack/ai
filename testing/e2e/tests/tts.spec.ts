import { generateSpeech } from '@tanstack/ai'
import { createElevenLabsSpeech } from '@tanstack/ai-elevenlabs'
import { test, expect } from './fixtures'
import {
  fillTextInput,
  clickGenerate,
  waitForGenerationComplete,
  featureUrl,
} from './helpers'
import { providersFor } from './test-matrix'

test.describe('elevenlabs -- tts formats', () => {
  test('returns playable WAV from the PCM endpoint', async ({
    page,
    testId,
    aimockPort,
  }) => {
    const result = await generateSpeech({
      adapter: createElevenLabsSpeech('eleven_v3', 'e2e-dummy', {
        baseURL: `http://127.0.0.1:${aimockPort}`,
        defaultHeaders: { 'X-Test-Id': testId },
      }),
      text: '[tts] WAV format regression',
      voice: 'test-voice',
      format: 'wav',
    })

    expect(result.format).toBe('wav')
    expect(result.contentType).toBe('audio/wav')
    const wav = Buffer.from(result.audio, 'base64')
    expect(wav.toString('ascii', 0, 4)).toBe('RIFF')
    expect(wav.readUInt32LE(24)).toBe(44100)
    expect(wav.readUInt32LE(40)).toBe(32)
    expect(wav.subarray(44)).toEqual(Buffer.alloc(32))

    const decoded = await page.evaluate(async (audio) => {
      const bytes = Uint8Array.from(atob(audio), (char) => char.charCodeAt(0))
      const context = new OfflineAudioContext(1, 16, 44100)
      const buffer = await context.decodeAudioData(bytes.buffer)
      return { channels: buffer.numberOfChannels, samples: buffer.length }
    }, result.audio)
    expect(decoded).toEqual({ channels: 1, samples: 16 })
  })

  for (const format of ['aac', 'flac'] as const) {
    test(`rejects unsupported ${format}`, async ({ testId, aimockPort }) => {
      await expect(
        generateSpeech({
          adapter: createElevenLabsSpeech('eleven_v3', 'e2e-dummy', {
            baseURL: `http://127.0.0.1:${aimockPort}`,
            defaultHeaders: { 'X-Test-Id': testId },
          }),
          text: '[tts] unsupported format regression',
          voice: 'test-voice',
          format,
        }),
      ).rejects.toThrow(
        `ElevenLabs TTS does not support format '${format}'. Use mp3, pcm, opus, or wav.`,
      )
    })
  }
})

for (const provider of providersFor('tts')) {
  test.describe(`${provider} -- tts`, () => {
    test('sse -- generates speech via SSE connection', async ({
      page,
      testId,
      aimockPort,
    }) => {
      await page.goto(featureUrl(provider, 'tts', testId, aimockPort, 'sse'))
      await fillTextInput(page, 'welcome to the guitar store')
      await clickGenerate(page)
      await waitForGenerationComplete(page)
      const audio = page.getByTestId('generated-audio')
      await expect(audio).toBeVisible()
    })

    test('http-stream -- generates speech via HTTP stream', async ({
      page,
      testId,
      aimockPort,
    }) => {
      await page.goto(
        featureUrl(provider, 'tts', testId, aimockPort, 'http-stream'),
      )
      await fillTextInput(page, 'welcome to the guitar store')
      await clickGenerate(page)
      await waitForGenerationComplete(page)
      const audio = page.getByTestId('generated-audio')
      await expect(audio).toBeVisible()
    })

    test('fetcher -- generates speech via server function', async ({
      page,
      testId,
      aimockPort,
    }) => {
      await page.goto(
        featureUrl(provider, 'tts', testId, aimockPort, 'fetcher'),
      )
      await fillTextInput(page, 'welcome to the guitar store')
      await clickGenerate(page)
      await waitForGenerationComplete(page)
      const audio = page.getByTestId('generated-audio')
      await expect(audio).toBeVisible()
    })
  })
}
