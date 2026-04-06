import { test, expect } from '@playwright/test'
import {
  sendMessage,
  waitForResponse,
  getLastAssistantMessage,
  approveToolCall,
  denyToolCall,
  isNotSupported,
} from './helpers'
import { providers } from './test-matrix'

// Tool approval requires the server to pause on needsApproval tools and emit
// approval-requested events. This needs investigation with llmock's tool call flow.
// Also uses sequenceIndex which is global. Skip for now.
test.skip()

for (const provider of providers) {
  test.describe(`${provider} — tool-approval`, () => {
    test('shows approval prompt and completes on approve', async ({ page }) => {
      await page.goto(`/${provider}/tool-approval`)
      if (await isNotSupported(page)) {
        test.skip()
        return
      }

      await sendMessage(page, '[approval] add the stratocaster to my cart')

      await expect(page.getByTestId('approval-prompt-addToCart')).toBeVisible()
      await approveToolCall(page, 'addToCart')
      await waitForResponse(page)

      const response = await getLastAssistantMessage(page)
      expect(response).toContain('added')
    })

    test('handles denial', async ({ page }) => {
      await page.goto(`/${provider}/tool-approval`)
      if (await isNotSupported(page)) {
        test.skip()
        return
      }

      await sendMessage(page, '[approval] add the stratocaster to my cart')

      await expect(page.getByTestId('approval-prompt-addToCart')).toBeVisible()
      await denyToolCall(page, 'addToCart')
      await waitForResponse(page)

      const messages = page.getByTestId('assistant-message')
      const count = await messages.count()
      expect(count).toBeGreaterThanOrEqual(1)
    })
  })
}
