import { test, expect } from './fixtures'
import { clickGenerate, waitForGenerationComplete, featureUrl } from './helpers'
import { providersFor } from './test-matrix'

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
