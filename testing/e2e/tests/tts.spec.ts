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

// Dialogue and timestamps are adapter capabilities, not a feature every TTS
// provider has. Seed Audio 1.0 is the one wired end to end here: its mount
// validates the request the adapter builds (`references` + `@AudioN` markers)
// and answers with the real mixed-unit subtitle shape, so this covers the core
// `turns` / `timestamps` contract, not just the client plumbing.
//
// ElevenLabs has both capabilities but talks to `/v1/text-to-dialogue`, which
// aimock does not serve — that adapter's four-way endpoint branch is covered
// by unit tests instead.
test.describe('byteplus -- tts dialogue', () => {
  test('fetcher -- turns come back with per-turn segments and word alignment', async ({
    page,
    testId,
    aimockPort,
  }) => {
    await page.goto(
      featureUrl('byteplus', 'tts', testId, aimockPort, 'fetcher'),
    )
    await clickGenerate(page, 'generate-dialogue-button')
    await waitForGenerationComplete(page)

    await expect(page.getByTestId('generated-audio')).toBeVisible()
    // Two turns in, two segments out.
    await expect(page.getByTestId('segment-count')).toHaveText('2')
    await expect(page.getByTestId('alignment-unit')).toHaveText('word')
    // 11 words at 400ms = 4400ms, reported in ms by the provider and
    // converted to seconds by the adapter.
    await expect(page.getByTestId('alignment-end')).toHaveText('4.4')
  })

  test('sse -- turns survive the streaming transport', async ({
    page,
    testId,
    aimockPort,
  }) => {
    await page.goto(featureUrl('byteplus', 'tts', testId, aimockPort, 'sse'))
    await clickGenerate(page, 'generate-dialogue-button')
    await waitForGenerationComplete(page)

    await expect(page.getByTestId('segment-count')).toHaveText('2')
    await expect(page.getByTestId('alignment-unit')).toHaveText('word')
  })
})
