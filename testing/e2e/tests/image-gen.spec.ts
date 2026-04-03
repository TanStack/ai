import { test, expect } from '@playwright/test'
import { isNotSupported } from './helpers'
import { providers } from './test-matrix'

for (const provider of providers) {
  test.describe(`${provider} — image-gen`, () => {
    test('generates an image', async ({ page }) => {
      await page.goto(`/${provider}/image-gen`)
      if (await isNotSupported(page)) { test.skip(); return }

      await page.getByTestId('send-button').click()
      await page.getByTestId('generated-image').waitFor({ state: 'visible', timeout: 15_000 })

      const img = page.getByTestId('generated-image')
      await expect(img).toBeVisible()
      const src = await img.getAttribute('src')
      expect(src).toBeTruthy()
    })
  })
}
