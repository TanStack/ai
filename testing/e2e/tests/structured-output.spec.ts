import { test, expect } from './fixtures'
import {
  sendMessage,
  waitForResponse,
  getLastAssistantMessage,
} from './helpers'
import { providersFor } from './test-matrix'

for (const provider of providersFor('structured-output')) {
  test.describe(`${provider} — structured-output`, () => {
    test('returns structured JSON response', async ({ page }) => {
      await page.goto(`/${provider}/structured-output`)

      await sendMessage(page, '[structured] recommend a guitar as json')
      await waitForResponse(page)

      const response = await getLastAssistantMessage(page)
      expect(response).toContain('Fender Stratocaster')
      expect(response).toContain('1299')
    })
  })
}
