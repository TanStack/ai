import { test, expect } from './fixtures'
import {
  clickGenerate,
  fillPrompt,
  featureUrl,
  waitForGenerationComplete,
} from './helpers'
import { providersFor } from './test-matrix'

for (const provider of providersFor('audio-gen')) {
  test.describe(`${provider} -- audio-gen`, () => {
    test('fetcher -- generates audio via server function', async ({
      page,
      testId,
      aimockPort,
    }) => {
      await page.goto(
        featureUrl(provider, 'audio-gen', testId, aimockPort, 'fetcher'),
      )
      await fillPrompt(page, '[audiogen] upbeat piano loop')
      await clickGenerate(page)
      await waitForGenerationComplete(page)
      const audio = page.getByTestId('generated-audio')
      await expect(audio).toBeVisible()
    })

    test('sse -- generates audio via direct route', async ({
      page,
      testId,
      aimockPort,
    }) => {
      // `audio-gen` does not have a streaming adapter — SSE/HTTP-stream modes
      // go through the same `/api/audio` JSON endpoint as the fetcher mode.
      await page.goto(
        featureUrl(provider, 'audio-gen', testId, aimockPort, 'sse'),
      )
      await fillPrompt(page, '[audiogen] upbeat piano loop')
      await clickGenerate(page)
      await waitForGenerationComplete(page)
      const audio = page.getByTestId('generated-audio')
      await expect(audio).toBeVisible()
    })
  })
}
