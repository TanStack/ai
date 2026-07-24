import { test, expect } from './fixtures'
import {
  fillPrompt,
  clickGenerate,
  waitForGenerationComplete,
  featureUrl,
} from './helpers'
import { providersFor } from './test-matrix'

// Follow-up image edits via generateImage's `previousImage`: generate an image,
// then submit an edit prompt with the completed image as the edit source.
// The core prepends the prior image to the prompt as an image part, which
// routes OpenAI's adapter to the multipart /v1/images/edits endpoint — the
// same pipeline the image-to-image spec exercises, but fed from a previous
// generation instead of a file upload.
for (const provider of providersFor('image-edit')) {
  test.describe(`${provider} -- image-edit`, () => {
    test('sse -- edits a generated image via previousImage', async ({
      page,
      request,
      testId,
      aimockPort,
    }) => {
      await page.goto(
        featureUrl(provider, 'image-edit', testId, aimockPort, 'sse'),
      )
      await page.waitForLoadState('networkidle')
      await fillPrompt(page, 'a guitar in a music store')
      await clickGenerate(page)
      await waitForGenerationComplete(page)
      const image = page.getByTestId('generated-image')
      await expect(image).toHaveCount(1)
      const originalSrc = await image.getAttribute('src')

      const editInput = page.getByTestId('edit-prompt-input')
      await editInput.click()
      await editInput.fill('add a tree to this product photo')
      await editInput.dispatchEvent('input', { bubbles: true })
      await page.getByTestId('edit-button').click()

      // The edit fixture returns a distinct 1x1 png data URL.
      await expect(image).toHaveAttribute('src', /^data:image\/png;base64,/, {
        timeout: 30_000,
      })
      expect(await image.getAttribute('src')).not.toBe(originalSrc)

      // Prove the edit routed through the multipart edits endpoint with the
      // prior generation attached (not /v1/images/generations).
      const journalRes = await request.get(
        `http://127.0.0.1:${aimockPort}/v1/_requests`,
      )
      const entries = (await journalRes.json()) as Array<{
        path?: string
        body?: unknown
      }>
      const editEntry = entries.find(
        (e) =>
          e.path === '/v1/images/edits' &&
          JSON.stringify(e.body ?? '').includes(
            'add a tree to this product photo',
          ),
      )
      expect(editEntry).toBeTruthy()
    })

    test('fetcher -- edits a generated image via server function', async ({
      page,
      testId,
      aimockPort,
    }) => {
      await page.goto(
        featureUrl(provider, 'image-edit', testId, aimockPort, 'fetcher'),
      )
      await page.waitForLoadState('networkidle')
      await fillPrompt(page, 'a guitar in a music store')
      await clickGenerate(page)
      await waitForGenerationComplete(page)
      const image = page.getByTestId('generated-image')
      await expect(image).toHaveCount(1)

      const editInput = page.getByTestId('edit-prompt-input')
      await editInput.click()
      await editInput.fill('add a tree to this product photo')
      await editInput.dispatchEvent('input', { bubbles: true })
      await page.getByTestId('edit-button').click()

      await expect(image).toHaveAttribute('src', /^data:image\/png;base64,/, {
        timeout: 30_000,
      })
    })
  })
}
