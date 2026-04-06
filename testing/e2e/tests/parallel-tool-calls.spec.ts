import { test, expect } from './fixtures'
import { sendMessage, waitForResponse, getToolCalls } from './helpers'
import { providersFor } from './test-matrix'

for (const provider of providersFor('parallel-tool-calls')) {
  test.describe(`${provider} — parallel-tool-calls`, () => {
    test('calls multiple tools in parallel', async ({ page }) => {
      await page.goto(`/${provider}/parallel-tool-calls`)

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
