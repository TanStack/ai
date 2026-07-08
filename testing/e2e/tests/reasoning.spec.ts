import { test, expect } from './fixtures'
import {
  sendMessage,
  waitForResponse,
  getLastAssistantMessage,
  featureUrl,
} from './helpers'
import { providersFor } from './test-matrix'

for (const provider of providersFor('reasoning')) {
  test.describe(`${provider} — reasoning`, () => {
    test('shows thinking block and final answer', async ({
      page,
      testId,
      aimockPort,
    }) => {
      await page.goto(featureUrl(provider, 'reasoning', testId, aimockPort))

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
