import { test, expect } from './fixtures'
import {
  fillPrompt,
  clickGenerate,
  waitForGenerationComplete,
  featureUrl,
} from './helpers'
import { providersFor } from './test-matrix'

/**
 * Expected embedding dimension: every provider's mock (the OpenAI JSON
 * fixture in fixtures/embedding/basic.json and the gemini/ollama/mistral
 * mounts in global-setup.ts) returns the same deterministic 8-dim vector.
 */
const EXPECTED_DIMENSIONS = 8

for (const provider of providersFor('embedding')) {
  test.describe(`${provider} -- embedding`, () => {
    test('embeds a batch of two texts', async ({
      page,
      testId,
      aimockPort,
    }) => {
      await page.goto(featureUrl(provider, 'embedding', testId, aimockPort))

      // The page splits the textarea on newlines — two lines make a
      // two-item batch. The first line matches the OpenAI fixture's
      // `inputText` (aimock joins batch inputs before matching).
      await fillPrompt(page, 'a red guitar\na blue drum kit')
      await clickGenerate(page)
      await waitForGenerationComplete(page)

      const vectors = page.getByTestId('embedding-vector')
      await expect(vectors).toHaveCount(2)
      for (let i = 0; i < 2; i++) {
        await expect(vectors.nth(i)).toHaveText(String(EXPECTED_DIMENSIONS))
        await expect(vectors.nth(i)).toHaveAttribute(
          'data-dimensions',
          String(EXPECTED_DIMENSIONS),
        )
      }
      await expect(page.getByTestId('embedding-model')).not.toBeEmpty()
    })
  })
}
