import { test, expect } from './fixtures'
import {
  sendMessage,
  waitForResponse,
  getLastAssistantMessage,
  isNotSupported,
} from './helpers'
import { providers } from './test-matrix'

for (const provider of providers) {
  test.describe(`${provider} — reasoning`, () => {
    test('shows thinking block and final answer', async ({ page }) => {
      await page.goto(`/${provider}/reasoning`)
      if (await isNotSupported(page)) {
        test.skip()
        return
      }

      await sendMessage(page, '[reasoning] recommend a guitar for a beginner')
      await waitForResponse(page)

      const thinkingBlock = page.getByTestId('thinking-block')
      await expect(thinkingBlock).toBeVisible()
      const thinking = await thinkingBlock.innerText()
      expect(thinking).toContain('beginner')

      const response = await getLastAssistantMessage(page)
      expect(response).toContain('Fender Stratocaster')
    })
  })
}
