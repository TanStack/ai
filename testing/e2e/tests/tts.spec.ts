import { test, expect } from './fixtures'
import {
  sendMessage,
  waitForResponse,
  getLastAssistantMessage,
} from './helpers'
import { providersFor } from './test-matrix'

for (const provider of providersFor('tts')) {
  test.describe(`${provider} — tts`, () => {
    test('generates speech audio', async ({ page }) => {
      await page.goto(`/${provider}/tts`)

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
