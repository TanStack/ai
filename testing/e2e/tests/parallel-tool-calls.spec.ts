import { test, expect } from './fixtures'
import {
  sendMessage,
  waitForResponse,
  getToolCalls,
  isNotSupported,
} from './helpers'
import { providers } from './test-matrix'

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
