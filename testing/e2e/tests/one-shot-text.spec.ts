import { test, expect } from './fixtures'
import {
  sendMessage,
  waitForResponse,
  getLastAssistantMessage,
} from './helpers'
import { providersFor } from './test-matrix'

for (const provider of providersFor('one-shot-text')) {
  test.describe(`${provider} — one-shot-text`, () => {
    test('sends a message and receives a non-streaming response', async ({
      page,
    }) => {
      await page.goto(`/${provider}/one-shot-text`)

      await sendMessage(page, '[oneshot] what is your most popular guitar')
      await waitForResponse(page)

      const response = await getLastAssistantMessage(page)
      expect(response).toContain('Fender Stratocaster')
    })
  })
}
