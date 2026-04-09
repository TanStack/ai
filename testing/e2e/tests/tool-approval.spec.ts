import { test, expect } from './fixtures'
import {
  sendMessage,
  waitForResponse,
  approveToolCall,
  denyToolCall,
  waitForAssistantText,
  featureUrl,
} from './helpers'
import { providersFor } from './test-matrix'

for (const provider of providersFor('tool-approval')) {
  test.describe(`${provider} — tool-approval`, () => {
    test('shows approval prompt and completes on approve', async ({
      page,
      testId,
      aimockPort,
    }) => {
      await page.goto(featureUrl(provider, 'tool-approval', testId, aimockPort))

      await sendMessage(page, '[approval] add the stratocaster to my cart')

      await expect(page.getByTestId('approval-prompt-addToCart')).toBeVisible()
      await approveToolCall(page, 'addToCart')

      // Wait for text response after approval + tool execution
      await waitForAssistantText(page, 'added')
    })

    test('handles denial', async ({ page, testId, aimockPort }) => {
      await page.goto(featureUrl(provider, 'tool-approval', testId, aimockPort))

      await sendMessage(page, '[approval] add the stratocaster to my cart')

      await expect(page.getByTestId('approval-prompt-addToCart')).toBeVisible()
      await denyToolCall(page, 'addToCart')
      await waitForResponse(page)

      const messages = page.getByTestId('assistant-message')
      const count = await messages.count()
      expect(count).toBeGreaterThanOrEqual(1)

      // Verify the denied tool was not executed successfully
      if (count > 0) {
        const lastMsg = await messages.last().innerText()
        expect(lastMsg).not.toContain('added')
      }
    })
  })
}
