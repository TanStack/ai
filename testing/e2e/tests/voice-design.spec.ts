import { test, expect } from './fixtures'
import {
  clickGenerate,
  featureUrl,
  fillPrompt,
  waitForGenerationComplete,
} from './helpers'
import { providersFor } from './test-matrix'

const PROMPT =
  'A warm, gravelly narrator in his sixties with a slight Irish lilt'

for (const provider of providersFor('voice-design')) {
  test.describe(`${provider} -- voice-design`, () => {
    test('designs candidate voices from a description', async ({
      page,
      testId,
      aimockPort,
    }) => {
      await page.goto(featureUrl(provider, 'voice-design', testId, aimockPort))
      await fillPrompt(page, PROMPT)
      await clickGenerate(page)
      await waitForGenerationComplete(page)

      const voices = page.getByTestId('designed-voice')
      await expect(voices).toHaveCount(2)
      // Unsaved candidates keep the provider's preview ids.
      await expect(voices.first()).toHaveAttribute(
        'data-voice-id',
        'e2e-preview-1',
      )
      await expect(voices.first()).toHaveAttribute('data-saved', 'false')
      await expect(
        page.getByTestId('voice-preview-audio').first(),
      ).toBeVisible()
      await expect(page.getByTestId('voice-preview-text')).toContainText(
        'quick brown fox',
      )
    })

    test('promotes the first candidate into a saved voice', async ({
      page,
      testId,
      aimockPort,
    }) => {
      await page.goto(featureUrl(provider, 'voice-design', testId, aimockPort))
      await fillPrompt(page, PROMPT)
      await page.getByTestId('save-voice-toggle').check()
      await page.getByTestId('voice-name-input').fill('Irish Narrator')
      await clickGenerate(page)
      await waitForGenerationComplete(page)

      const voices = page.getByTestId('designed-voice')
      await expect(voices).toHaveCount(2)
      // The promoted candidate swaps its preview id for a library voice id;
      // the runner-up stays an unsaved preview.
      await expect(voices.first()).toHaveAttribute(
        'data-voice-id',
        'e2e-saved-voice',
      )
      await expect(voices.first()).toHaveAttribute('data-saved', 'true')
      await expect(voices.nth(1)).toHaveAttribute('data-saved', 'false')
    })
  })
}
