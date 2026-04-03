import { test, expect } from '@playwright/test'
import { isNotSupported, getTranscriptionResult } from './helpers'
import { providers } from './test-matrix'

// llmock does not support transcription endpoints (/v1/audio/transcriptions)
test.skip()

for (const provider of providers) {
  test.describe(`${provider} — transcription`, () => {
    test('transcribes audio to text', async ({ page }) => {
      await page.goto(`/${provider}/transcription`)
      if (await isNotSupported(page)) {
        test.skip()
        return
      }

      await page.getByTestId('send-button').click()
      const result = await getTranscriptionResult(page)
      expect(result).toContain('Fender Stratocaster')
    })
  })
}
