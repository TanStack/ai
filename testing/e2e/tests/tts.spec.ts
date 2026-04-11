import { test, expect } from './fixtures'
import {
  sendMessage,
  waitForResponse,
  getLastAssistantMessage,
  featureUrl,
} from './helpers'
import { providersFor } from './test-matrix'

for (const provider of providersFor('tts')) {
  test.describe(`${provider} — tts`, () => {
    test('generates speech audio', async ({ page, testId, aimockPort }) => {
      await page.goto(featureUrl(provider, 'tts', testId, aimockPort))

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
