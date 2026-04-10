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

      await expect(page.getByTestId('approval-prompt-addToCart')).toBeVisible({
        timeout: 20000,
      })
      await approveToolCall(page, 'addToCart')

      // Wait for text response after approval + tool execution
      await waitForAssistantText(page, 'added')
    })

    test('handles denial', async ({ page, testId, aimockPort }) => {
      await page.goto(featureUrl(provider, 'tool-approval', testId, aimockPort))

      await sendMessage(page, '[approval-deny] add the stratocaster to my cart')

      await expect(page.getByTestId('approval-prompt-addToCart')).toBeVisible({
        timeout: 20000,
      })
      await denyToolCall(page, 'addToCart')
      await waitForResponse(page)

      // After denial, verify the approval prompt is no longer showing
      // (the tool state transitions from 'approval-requested' to 'approval-responded')
      await expect(
        page.getByTestId('approval-prompt-addToCart'),
      ).not.toBeVisible({ timeout: 10000 })

      // An assistant message should exist (the LLM responds after denial)
      const messages = page.getByTestId('assistant-message')
      const count = await messages.count()
      expect(count).toBeGreaterThanOrEqual(1)
    })
  })
}
