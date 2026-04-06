import { test, expect } from './fixtures'
import {
  sendMessage,
  waitForResponse,
  getLastAssistantMessage,
  isNotSupported,
} from './helpers'
import { providers } from './test-matrix'

for (const provider of providers) {
  test.describe(`${provider} — transcription`, () => {
    test('transcribes audio to text', async ({ page }) => {
      await page.goto(`/${provider}/transcription`)
      if (await isNotSupported(page)) {
        test.skip()
        return
      }

      await sendMessage(page, '[transcription] transcribe the audio clip')
      await waitForResponse(page)

      const response = await getLastAssistantMessage(page)
      expect(response).toContain('Fender Stratocaster')
    })
  })
}
