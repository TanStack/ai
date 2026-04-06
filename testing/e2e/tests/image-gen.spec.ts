import { test, expect } from './fixtures'
import {
  sendMessage,
  waitForResponse,
  getLastAssistantMessage,
  isNotSupported,
} from './helpers'
import { providers } from './test-matrix'

for (const provider of providers) {
  test.describe(`${provider} — image-gen`, () => {
    test('generates an image', async ({ page }) => {
      await page.goto(`/${provider}/image-gen`)
      if (await isNotSupported(page)) {
        test.skip()
        return
      }

      await sendMessage(page, '[imagegen] generate a guitar in a music store')
      await waitForResponse(page)

      const response = await getLastAssistantMessage(page)
      expect(response).toContain('guitar')
    })
  })
}
