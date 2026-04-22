import { test, expect } from './fixtures'
import {
  clickGenerate,
  fillPrompt,
  featureUrl,
  waitForGenerationComplete,
} from './helpers'
import { providersFor } from './test-matrix'

for (const provider of providersFor('music-gen')) {
  test.describe(`${provider} -- music-gen`, () => {
    test('fetcher -- generates music via server function', async ({
      page,
      testId,
      aimockPort,
    }) => {
      await page.goto(
        featureUrl(provider, 'music-gen', testId, aimockPort, 'fetcher'),
      )
      await fillPrompt(page, '[musicgen] upbeat piano loop')
      await clickGenerate(page)
      await waitForGenerationComplete(page)
      const audio = page.getByTestId('generated-audio')
      await expect(audio).toBeVisible()
    })

    test('sse -- generates music via direct route', async ({
      page,
      testId,
      aimockPort,
    }) => {
      // `music-gen` does not have a streaming adapter — SSE/HTTP-stream modes
      // go through the same `/api/music` JSON endpoint as the fetcher mode.
      await page.goto(
        featureUrl(provider, 'music-gen', testId, aimockPort, 'sse'),
      )
      await fillPrompt(page, '[musicgen] upbeat piano loop')
      await clickGenerate(page)
      await waitForGenerationComplete(page)
      const audio = page.getByTestId('generated-audio')
      await expect(audio).toBeVisible()
    })
  })
}
