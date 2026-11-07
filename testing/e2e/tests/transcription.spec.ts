import { test, expect } from './fixtures'
import { clickGenerate, waitForGenerationComplete, featureUrl } from './helpers'
import { providersFor } from './test-matrix'

test('cartesia mock rejects an empty file or incorrect model', async ({
  testId,
  aimockPort,
}) => {
  for (const [audio, model] of [
    ['', 'ink-whisper'],
    ['Hello', 'wrong'],
  ] as const) {
    const form = new FormData()
    form.append('file', new File([audio], 'audio.mp3', { type: 'audio/mpeg' }))
    form.append('model', model)
    const response = await fetch(`http://127.0.0.1:${aimockPort}/stt`, {
      method: 'POST',
      headers: { 'Cartesia-Version': '2026-08-14', 'X-Test-Id': testId },
      body: form,
    })
    expect(response.status).toBe(400)
  }
})

for (const provider of providersFor('transcription')) {
  test.describe(`${provider} -- transcription`, () => {
    test('sse -- transcribes audio via SSE connection', async ({
      page,
      testId,
      aimockPort,
    }) => {
      await page.goto(
        featureUrl(provider, 'transcription', testId, aimockPort, 'sse'),
      )
      await clickGenerate(page)
      await waitForGenerationComplete(page)
      const text = await page.getByTestId('transcription-text').innerText()
      expect(text).toContain('Fender Stratocaster')
    })

    test('http-stream -- transcribes audio via HTTP stream', async ({
      page,
      testId,
      aimockPort,
    }) => {
      await page.goto(
        featureUrl(
          provider,
          'transcription',
          testId,
          aimockPort,
          'http-stream',
        ),
      )
      await clickGenerate(page)
      await waitForGenerationComplete(page)
      const text = await page.getByTestId('transcription-text').innerText()
      expect(text).toContain('Fender Stratocaster')
    })

    test('fetcher -- transcribes audio via server function', async ({
      page,
      testId,
      aimockPort,
    }) => {
      await page.goto(
        featureUrl(provider, 'transcription', testId, aimockPort, 'fetcher'),
      )
      await clickGenerate(page)
      await waitForGenerationComplete(page)
      const text = await page.getByTestId('transcription-text').innerText()
      expect(text).toContain('Fender Stratocaster')
    })
  })
}

for (const provider of providersFor('transcription-diarization')) {
  test.describe(`${provider} -- transcription-diarization`, () => {
    for (const mode of ['sse', 'http-stream', 'fetcher'] as const) {
      test(`${mode} -- transcribes diarized audio`, async ({
        page,
        testId,
        aimockPort,
      }) => {
        await page.goto(
          featureUrl(
            provider,
            'transcription-diarization',
            testId,
            aimockPort,
            mode,
          ),
        )
        await clickGenerate(page)
        await waitForGenerationComplete(page)

        await expect(page.getByTestId('transcription-text')).toContainText(
          'Fender Stratocaster',
        )
        await expect(page.getByTestId('transcription-segments')).toContainText(
          'Welcome to the store',
        )
        await expect(page.getByTestId('transcription-segments')).toContainText(
          'I need a Fender Stratocaster',
        )
        await expect(page.getByTestId('transcription-speaker-0')).toHaveText(
          'agent',
        )
        await expect(page.getByTestId('transcription-speaker-1')).toHaveText(
          'customer',
        )
      })
    }
  })
}
