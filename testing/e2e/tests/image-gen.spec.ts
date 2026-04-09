import { test, expect } from './fixtures'
import {
  sendMessage,
  waitForResponse,
  getLastAssistantMessage,
  featureUrl,
} from './helpers'
import { providersFor } from './test-matrix'

for (const provider of providersFor('image-gen')) {
  test.describe(`${provider} — image-gen`, () => {
    test('generates an image', async ({ page, testId, aimockPort }) => {
      await page.goto(featureUrl(provider, 'image-gen', testId, aimockPort))

      await sendMessage(page, '[imagegen] generate a guitar in a music store')
      await waitForResponse(page)

      const response = await getLastAssistantMessage(page)
      expect(response).toContain('guitar')
    })
  })
}
