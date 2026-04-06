import { test, expect } from './fixtures'
import {
  sendMessage,
  waitForResponse,
  getLastAssistantMessage,
  isNotSupported,
} from './helpers'
import { providers } from './test-matrix'

for (const provider of providers) {
  test.describe(`${provider} — tts`, () => {
    test('generates speech audio', async ({ page }) => {
      await page.goto(`/${provider}/tts`)
      if (await isNotSupported(page)) {
        test.skip()
        return
      }

      await sendMessage(
        page,
        '[tts] generate speech for welcome to the guitar store',
      )
      await waitForResponse(page)

      const response = await getLastAssistantMessage(page)
      expect(response).toContain('guitar store')
    })
  })
}
