import { test, expect } from './fixtures'
import {
  sendMessageWithImage,
  waitForResponse,
  getLastAssistantMessage,
  isNotSupported,
} from './helpers'
import { providers } from './test-matrix'
import { fileURLToPath } from 'url'
import path from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const testImagePath = path.resolve(__dirname, '../test-assets/guitar-meme.jpg')

for (const provider of providers) {
  test.describe(`${provider} — multimodal-image`, () => {
    test('describes an uploaded image', async ({ page }) => {
      await page.goto(`/${provider}/multimodal-image`)
      if (await isNotSupported(page)) {
        test.skip()
        return
      }

      await sendMessageWithImage(
        page,
        '[mmimage] describe this image',
        testImagePath,
      )
      await waitForResponse(page)

      const response = await getLastAssistantMessage(page)
      expect(response).toContain('guitar')
    })
  })
}
