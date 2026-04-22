import { test, expect } from './fixtures'
import {
  clickGenerate,
  fillPrompt,
  featureUrl,
  waitForGenerationComplete,
} from './helpers'
import { providersFor } from './test-matrix'

// No mocked SFX provider yet — this loop is empty. When a provider is added to
// `feature-support.ts` / `test-matrix.ts` and a matching fixture drops into
// `fixtures/sound-effects-gen/`, these tests run automatically.
for (const provider of providersFor('sound-effects-gen')) {
  test.describe(`${provider} -- sound-effects-gen`, () => {
    test('fetcher -- generates sound effect via server function', async ({
      page,
      testId,
      aimockPort,
    }) => {
      await page.goto(
        featureUrl(
          provider,
          'sound-effects-gen',
          testId,
          aimockPort,
          'fetcher',
        ),
      )
      await fillPrompt(page, '[sfxgen] thunderclap and rain')
      await clickGenerate(page)
      await waitForGenerationComplete(page)
      const audio = page.getByTestId('generated-audio')
      await expect(audio).toBeVisible()
    })

    test('sse -- generates sound effect via direct route', async ({
      page,
      testId,
      aimockPort,
    }) => {
      await page.goto(
        featureUrl(provider, 'sound-effects-gen', testId, aimockPort, 'sse'),
      )
      await fillPrompt(page, '[sfxgen] thunderclap and rain')
      await clickGenerate(page)
      await waitForGenerationComplete(page)
      const audio = page.getByTestId('generated-audio')
      await expect(audio).toBeVisible()
    })
  })
}
