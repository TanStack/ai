import { test, expect } from '@playwright/test'
import { isNotSupported, getAudioPlayer } from './helpers'
import { providers } from './test-matrix'

// llmock does not support TTS endpoints (/v1/audio/speech)
test.skip()

for (const provider of providers) {
  test.describe(`${provider} — tts`, () => {
    test('generates speech audio', async ({ page }) => {
      await page.goto(`/${provider}/tts`)
      if (await isNotSupported(page)) {
        test.skip()
        return
      }

      await page.getByTestId('send-button').click()

      const audio = await getAudioPlayer(page)
      await expect(audio).toBeVisible({ timeout: 15_000 })
    })
  })
}
