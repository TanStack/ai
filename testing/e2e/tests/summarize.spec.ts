import { test, expect } from '@playwright/test'
import {
  sendMessage,
  waitForResponse,
  getLastAssistantMessage,
  isNotSupported,
} from './helpers'
import { providers } from './test-matrix'

for (const provider of providers) {
  test.describe(`${provider} — summarize`, () => {
    test('summarizes text', async ({ page }) => {
      await page.goto(`/${provider}/summarize`)
      if (await isNotSupported(page)) {
        test.skip()
        return
      }

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
