import { test, expect } from './fixtures'
import {
  fillPrompt,
  clickGenerate,
  waitForGenerationComplete,
  featureUrl,
} from './helpers'
import { providersFor } from './test-matrix'

// Follow-up video edits via generateVideo's `previousJobId`: generate a clip,
// then chain an edit prompt onto the completed result. OpenAI runs Sora's
// `POST /v1/videos/{id}/remix` (openaiVideoRemixMount answers the remix
// create and its poll); Gemini chains Omni's `previous_interaction_id`
// (geminiOmniVideoMount returns a distinct clip for the edit job). In both
// cases the spec proves the round-trip by asserting the rendered video
// source changes to the edit job's clip.
const EXPECTED_EDITED_SRC: Record<string, RegExp> = {
  openai: /guitar-store-remixed\.mp4$/,
  gemini: /^data:video\/mp4;base64,AAAAIGZ0eXBpc29tAAACAGVkaXRlZA==$/,
}

for (const provider of providersFor('video-edit')) {
  test.describe(`${provider} -- video-edit`, () => {
    test('sse -- edits a completed generation via previousJobId', async ({
      page,
      testId,
      aimockPort,
    }) => {
      await page.goto(
        featureUrl(provider, 'video-edit', testId, aimockPort, 'sse'),
      )
      await fillPrompt(page, 'a guitar being played in a store')
      await clickGenerate(page)
      await waitForGenerationComplete(page, 60_000)
      const video = page.getByTestId('generated-video')
      await expect(video).toBeVisible()
      const originalSrc = await video.getAttribute('src')

      const editInput = page.getByTestId('edit-prompt-input')
      await editInput.click()
      await editInput.fill('make it nighttime')
      await editInput.dispatchEvent('input', { bubbles: true })
      await page.getByTestId('edit-button').click()

      await expect(video).toHaveAttribute(
        'src',
        EXPECTED_EDITED_SRC[provider]!,
        { timeout: 60_000 },
      )
      expect(await video.getAttribute('src')).not.toBe(originalSrc)
    })

    test('fetcher -- edits a completed generation via server function', async ({
      page,
      testId,
      aimockPort,
    }) => {
      await page.goto(
        featureUrl(provider, 'video-edit', testId, aimockPort, 'fetcher'),
      )
      await fillPrompt(page, 'a guitar being played in a store')
      await clickGenerate(page)
      await waitForGenerationComplete(page, 60_000)
      const video = page.getByTestId('generated-video')
      await expect(video).toBeVisible()

      const editInput = page.getByTestId('edit-prompt-input')
      await editInput.click()
      await editInput.fill('make it nighttime')
      await editInput.dispatchEvent('input', { bubbles: true })
      await page.getByTestId('edit-button').click()

      await expect(video).toHaveAttribute(
        'src',
        EXPECTED_EDITED_SRC[provider]!,
        { timeout: 60_000 },
      )
    })
  })
}
