import { test, expect } from './fixtures'
import {
  clickGenerate,
  fillPrompt,
  featureUrl,
  waitForGenerationComplete,
} from './helpers'
import { providersFor } from './test-matrix'

for (const provider of providersFor('sound-effects')) {
  test.describe(`${provider} -- sound-effects`, () => {
    test('fetcher -- generates a sound effect via server function', async ({
      page,
      testId,
      aimockPort,
    }) => {
      await page.goto(
        featureUrl(provider, 'sound-effects', testId, aimockPort, 'fetcher'),
      )
      await fillPrompt(page, '[sfx] castle door opening')
      await clickGenerate(page)
      await waitForGenerationComplete(page)
      const audio = page.getByTestId('generated-audio')
      await expect(audio).toBeVisible()
    })

    test('sse -- generates a sound effect via direct route', async ({
      page,
      testId,
      aimockPort,
    }) => {
      await page.goto(
        featureUrl(provider, 'sound-effects', testId, aimockPort, 'sse'),
      )
      await fillPrompt(page, '[sfx] castle door opening')
      await clickGenerate(page)
      await waitForGenerationComplete(page)
      const audio = page.getByTestId('generated-audio')
      await expect(audio).toBeVisible()
    })
  })
}
