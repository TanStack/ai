import { test, expect } from '@playwright/test'
import {
  sendMessage,
  waitForResponse,
  getLastAssistantMessage,
  getToolCalls,
  isNotSupported,
} from './helpers'
import { providers } from './test-matrix'

for (const provider of providers) {
  test.describe(`${provider} — tool-calling`, () => {
    test('calls getGuitars and displays result', async ({ page }) => {
      await page.goto(`/${provider}/tool-calling`)
      if (await isNotSupported(page)) {
        test.skip()
        return
      }

      await sendMessage(page, 'what guitars do you have in stock')
      await waitForResponse(page)

      const toolCalls = await getToolCalls(page)
      expect(toolCalls.length).toBeGreaterThanOrEqual(1)
      expect(toolCalls[0].name).toBe('getGuitars')

      const response = await getLastAssistantMessage(page)
      expect(response).toContain('Fender Stratocaster')
    })
  })
}
