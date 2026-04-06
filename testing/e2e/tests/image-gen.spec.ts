import { test, expect } from './fixtures'
import { isNotSupported } from './helpers'
import { providers } from './test-matrix'

// llmock does not support image generation endpoints (/v1/images/generations)
test.skip()

for (const provider of providers) {
  test.describe(`${provider} — image-gen`, () => {
    test('generates an image', async ({ page }) => {
      await page.goto(`/${provider}/image-gen`)
      if (await isNotSupported(page)) {
        test.skip()
        return
      }

      await page.getByTestId('send-button').click()
      await page
        .getByTestId('generated-image')
        .waitFor({ state: 'visible', timeout: 15_000 })

      const img = page.getByTestId('generated-image')
      await expect(img).toBeVisible()
      const src = await img.getAttribute('src')
      expect(src).toBeTruthy()
    })
  })
}
