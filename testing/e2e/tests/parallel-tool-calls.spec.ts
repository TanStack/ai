import { test, expect } from './fixtures'
import {
  sendMessage,
  waitForResponse,
  getToolCalls,
  waitForAssistantText,
  featureUrl,
} from './helpers'
import { providersFor } from './test-matrix'

for (const provider of providersFor('parallel-tool-calls')) {
  test.describe(`${provider} — parallel-tool-calls`, () => {
    test('calls multiple tools in parallel', async ({
      page,
      testId,
      aimockPort,
    }) => {
      await page.goto(
        featureUrl(provider, 'parallel-tool-calls', testId, aimockPort),
      )

      await sendMessage(
        page,
        '[parallel] compare the stratocaster and les paul',
      )
      await waitForResponse(page)

      const toolCalls = await getToolCalls(page)
      const toolNames = toolCalls.map((t) => t.name)
      expect(toolNames).toContain('getGuitars')
      expect(toolNames).toContain('compareGuitars')

      // Wait for text response after tool execution
      await waitForAssistantText(page, 'Stratocaster')
    })

    // Ollama sends no tool-call ids, so this guards the fallback id
    test('keeps parallel calls to the same tool apart', async ({
      page,
      testId,
      aimockPort,
    }) => {
      await page.goto(
        featureUrl(provider, 'parallel-tool-calls', testId, aimockPort),
      )

      await sendMessage(
        page,
        '[parallel-same] compare guitars 1 and 2, then 3 and 4',
      )
      await waitForResponse(page)

      const toolNames = (await getToolCalls(page)).map((t) => t.name)
      expect(toolNames).toEqual(['compareGuitars', 'compareGuitars'])

      await waitForAssistantText(page, 'Both comparisons are done')
    })
  })
}
