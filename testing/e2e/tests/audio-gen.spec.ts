import { test, expect } from './fixtures'
import {
  clickGenerate,
  fillPrompt,
  featureUrl,
  waitForGenerationComplete,
} from './helpers'
import { providersFor } from './test-matrix'

// Gemini Lyria fixtures aren't wired yet; scope to elevenlabs music_v1 for now.
const PROVIDERS = providersFor('audio-gen').filter((p) => p === 'elevenlabs')

for (const provider of PROVIDERS) {
  test.describe(`${provider} -- audio-gen`, () => {
    test('fetcher -- generates music via server function', async ({
      page,
      testId,
      aimockPort,
    }) => {
      await page.goto(
        featureUrl(provider, 'audio-gen', testId, aimockPort, 'fetcher'),
      )
      await fillPrompt(page, '[music] an upbeat lo-fi beat for the guitar store')
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
      await page.goto(
        featureUrl(provider, 'audio-gen', testId, aimockPort, 'sse'),
      )
      await fillPrompt(page, '[music] an upbeat lo-fi beat for the guitar store')
      await clickGenerate(page)
      await waitForGenerationComplete(page)
      const audio = page.getByTestId('generated-audio')
      await expect(audio).toBeVisible()
    })
  })
}
