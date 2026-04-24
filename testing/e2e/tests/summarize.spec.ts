import { test, expect } from './fixtures'
import {
  sendMessage,
  waitForResponse,
  getLastAssistantMessage,
  featureUrl,
} from './helpers'
import { providersFor } from './test-matrix'

for (const provider of providersFor('summarize')) {
  test.describe(`${provider} — summarize`, () => {
    test('summarizes text', async ({ page, testId, aimockPort }) => {
      await page.goto(featureUrl(provider, 'summarize', testId, aimockPort))

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
