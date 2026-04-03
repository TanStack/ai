import { test, expect } from '@playwright/test'
import {
  sendMessage,
  waitForResponse,
  getLastAssistantMessage,
  isNotSupported,
} from './helpers'
import { providers } from './test-matrix'

for (const provider of providers) {
  test.describe(`${provider} — multi-turn`, () => {
    test('handles a multi-turn conversation', async ({ page }) => {
      await page.goto(`/${provider}/multi-turn`)
      if (await isNotSupported(page)) {
        test.skip()
        return
      }

      await sendMessage(page, '[multiturn-1] what guitars do you have')
      await waitForResponse(page)
      const firstResponse = await getLastAssistantMessage(page)
      expect(firstResponse).toContain('Fender Stratocaster')

      await sendMessage(page, '[multiturn-2] tell me about the cheapest one')
      await waitForResponse(page)
      const secondResponse = await getLastAssistantMessage(page)
      expect(secondResponse).toContain('$1,299')
    })
  })
}
