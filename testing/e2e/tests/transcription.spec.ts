import { test, expect } from './fixtures'
import {
  sendMessage,
  waitForResponse,
  getLastAssistantMessage,
  featureUrl,
} from './helpers'
import { providersFor } from './test-matrix'

for (const provider of providersFor('transcription')) {
  test.describe(`${provider} — transcription`, () => {
    test('transcribes audio to text', async ({ page, testId, aimockPort }) => {
      await page.goto(
        featureUrl(provider, 'transcription', testId, aimockPort),
      )

      await sendMessage(page, '[transcription] transcribe the audio clip')
      await waitForResponse(page)

      const response = await getLastAssistantMessage(page)
      expect(response).toContain('Fender Stratocaster')
    })
  })
}
