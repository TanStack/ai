import { test, expect } from './fixtures'
import {
  sendMessage,
  waitForResponse,
  getToolCalls,
  getLastAssistantMessage,
  waitForAssistantText,
  featureUrl,
} from './helpers'
import { providersFor } from './test-matrix'

for (const provider of providersFor('text-tool-text')) {
  test.describe(`${provider} — text-tool-text`, () => {
    test('returns text and tool call in same response, then final text after tool execution', async ({
      page,
      testId,
      aimockPort,
    }) => {
      await page.goto(
        featureUrl(provider, 'text-tool-text', testId, aimockPort),
      )

      await sendMessage(page, '[text-tool-text] check what guitars we have')
      await waitForResponse(page)

      // Should have the initial text AND a tool call in the response
      const toolCalls = await getToolCalls(page)
      expect(toolCalls.length).toBeGreaterThanOrEqual(1)
      expect(toolCalls[0].name).toBe('getGuitars')

      // Wait for the final text response after tool execution
      await waitForAssistantText(page, 'Fender Stratocaster')

      // The initial "Let me check" text should also be present
      const messages = page.getByTestId('assistant-message')
      const allText = await messages.allInnerTexts()
      const combined = allText.join(' ')
      expect(combined).toContain('Let me check')
      expect(combined).toContain('Fender Stratocaster')
    })
  })
}
