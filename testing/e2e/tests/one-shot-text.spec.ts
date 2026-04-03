import { test, expect } from '@playwright/test'
import {
  sendMessage,
  waitForResponse,
  getLastAssistantMessage,
  isNotSupported,
} from './helpers'
import { providers } from './test-matrix'

for (const provider of providers) {
  test.describe(`${provider} — one-shot-text`, () => {
    test('sends a message and receives a non-streaming response', async ({
      page,
    }) => {
      await page.goto(`/${provider}/one-shot-text`)
      if (await isNotSupported(page)) {
        test.skip()
        return
      }

      await sendMessage(page, 'what is your most popular guitar')
      await waitForResponse(page)

      const response = await getLastAssistantMessage(page)
      expect(response).toContain('Fender Stratocaster')
    })
  })
}
