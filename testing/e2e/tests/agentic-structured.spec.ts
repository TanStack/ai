import { test, expect } from '@playwright/test'
import {
  sendMessage,
  waitForResponse,
  getLastAssistantMessage,
  getToolCalls,
  isNotSupported,
} from './helpers'

// Tool fixtures use sequenceIndex which is a global counter in llmock.
// Only test with openai since the agentic loop is provider-agnostic.
const providers = ['openai'] as const

for (const provider of providers) {
  test.describe(`${provider} — agentic-structured`, () => {
    test('calls tools then returns structured output', async ({ page }) => {
      await page.goto(`/${provider}/agentic-structured`)
      if (await isNotSupported(page)) {
        test.skip()
        return
      }

      await sendMessage(page, '[agentic] check inventory and recommend')
      await waitForResponse(page)

      const toolCalls = await getToolCalls(page)
      expect(toolCalls.length).toBeGreaterThanOrEqual(1)

      const response = await getLastAssistantMessage(page)
      expect(response).toContain('Fender Stratocaster')
    })
  })
}
