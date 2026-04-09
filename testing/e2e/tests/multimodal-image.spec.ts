import { test, expect } from './fixtures'
import {
  sendMessageWithImage,
  waitForResponse,
  getLastAssistantMessage,
  featureUrl,
} from './helpers'
import { providersFor } from './test-matrix'
import { fileURLToPath } from 'url'
import path from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const testImagePath = path.resolve(__dirname, '../test-assets/guitar-meme.jpg')

for (const provider of providersFor('multimodal-image')) {
  test.describe(`${provider} — multimodal-image`, () => {
    test('describes an uploaded image', async ({
      page,
      testId,
      aimockPort,
    }) => {
      await page.goto(
        featureUrl(provider, 'multimodal-image', testId, aimockPort),
      )

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
