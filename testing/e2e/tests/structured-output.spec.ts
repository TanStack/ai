import { test, expect } from '@playwright/test'
import {
  sendMessage,
  waitForResponse,
  getLastAssistantMessage,
  isNotSupported,
} from './helpers'
import { providers } from './test-matrix'

for (const provider of providers) {
  test.describe(`${provider} — structured-output`, () => {
    test('returns structured JSON response', async ({ page }) => {
      await page.goto(`/${provider}/structured-output`)
      if (await isNotSupported(page)) {
        test.skip()
        return
      }

      await sendMessage(page, '[structured] recommend a guitar as json')
      await waitForResponse(page)

      const response = await getLastAssistantMessage(page)
      expect(response).toContain('Fender Stratocaster')
      expect(response).toContain('1299')
    })
  })
}
