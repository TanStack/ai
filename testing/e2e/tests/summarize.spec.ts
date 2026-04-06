import { test, expect } from './fixtures'
import {
  sendMessage,
  waitForResponse,
  getLastAssistantMessage,
} from './helpers'
import { providersFor } from './test-matrix'

for (const provider of providersFor('summarize')) {
  test.describe(`${provider} — summarize`, () => {
    test('summarizes text', async ({ page }) => {
      await page.goto(`/${provider}/summarize`)

      await sendMessage(
        page,
        '[summarize] The Fender Stratocaster is a versatile electric guitar',
      )
      await waitForResponse(page)
      const result = await getLastAssistantMessage(page)
      expect(result.length).toBeGreaterThan(0)
      expect(result).toContain('Fender')
    })
  })
}
