import { test, expect } from './fixtures'
import {
  sendMessage,
  waitForResponse,
  getLastAssistantMessage,
} from './helpers'
import { providersFor } from './test-matrix'

for (const provider of providersFor('image-gen')) {
  test.describe(`${provider} — image-gen`, () => {
    test('generates an image', async ({ page }) => {
      await page.goto(`/${provider}/image-gen`)

      await sendMessage(page, '[imagegen] generate a guitar in a music store')
      await waitForResponse(page)

      const response = await getLastAssistantMessage(page)
      expect(response).toContain('guitar')
    })
  })
}
