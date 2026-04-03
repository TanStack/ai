import { test, expect } from '@playwright/test'
import {
  sendMessageWithImage,
  waitForResponse,
  getLastAssistantMessage,
  isNotSupported,
} from './helpers'
import { providers } from './test-matrix'

// Multimodal + structured output needs provider-specific fixture tuning
test.skip()
import { fileURLToPath } from 'url'
import path from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const testImagePath = path.resolve(__dirname, '../test-assets/guitar-shop.png')

for (const provider of providers) {
  test.describe(`${provider} — multimodal-structured`, () => {
    test('analyzes an image and returns structured output', async ({
      page,
    }) => {
      await page.goto(`/${provider}/multimodal-structured`)
      if (await isNotSupported(page)) {
        test.skip()
        return
      }

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
