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
const testImagePath = path.resolve(__dirname, '../test-assets/guitar-shop.png')

for (const provider of providersFor('multimodal-structured')) {
  test.describe(`${provider} — multimodal-structured`, () => {
    test('analyzes an image and returns structured output', async ({
      page,
      testId,
      aimockPort,
    }) => {
      await page.goto(
        featureUrl(provider, 'multimodal-structured', testId, aimockPort),
      )

      await sendMessageWithImage(
        page,
        '[mmstruct] analyze this image',
        testImagePath,
      )
      await waitForResponse(page)

      const response = await getLastAssistantMessage(page)
      expect(response).toContain('guitar')
    })
  })
}
