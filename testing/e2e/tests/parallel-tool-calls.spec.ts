import { test, expect } from '@playwright/test'
import {
  sendMessage,
  waitForResponse,
  getToolCalls,
  isNotSupported,
} from './helpers'

// Tool fixtures use sequenceIndex which is a global counter in llmock.
// Only test with openai since the agentic loop is provider-agnostic.
const providers = ['openai'] as const

for (const provider of providers) {
  test.describe(`${provider} — parallel-tool-calls`, () => {
    test('calls multiple tools in parallel', async ({ page }) => {
      await page.goto(`/${provider}/parallel-tool-calls`)
      if (await isNotSupported(page)) {
        test.skip()
        return
      }

      await sendMessage(
        page,
        '[parallel] compare the stratocaster and les paul',
      )
      await waitForResponse(page)

      const toolCalls = await getToolCalls(page)
      const toolNames = toolCalls.map((t) => t.name)
      expect(toolNames).toContain('getGuitars')
      expect(toolNames).toContain('compareGuitars')
    })
  })
}
