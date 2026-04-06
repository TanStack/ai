import { test, expect } from './fixtures'
import {
  sendMessage,
  waitForResponse,
  getLastAssistantMessage,
} from './helpers'
import { providersFor } from './test-matrix'

for (const provider of providersFor('summarize-stream')) {
  test.describe(`${provider} — summarize-stream`, () => {
    test('summarizes text with streaming', async ({ page }) => {
      await page.goto(`/${provider}/summarize-stream`)

      await sendMessage(
        page,
        '[summarize] The Fender Stratocaster is a versatile electric guitar',
      )
      await waitForResponse(page)
      const result = await getLastAssistantMessage(page)
      expect(result.length).toBeGreaterThan(0)
    })
  })
}
