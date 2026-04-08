import { test, expect } from './fixtures'
import { sendMessage } from './helpers'

test.describe('Abort/Cancellation', () => {
  test.beforeEach(async ({ aimock }) => {
    // Add a slow-streaming fixture so there's time to click stop
    aimock.addFixture({
      match: { userMessage: '[abort-test] tell me a long story' },
      response: {
        content:
          'Once upon a time in a land far away there lived a guitar maker who spent decades perfecting the art of crafting beautiful instruments from the finest tonewoods available in the forests nearby and each guitar was unique and special',
      },
      opts: { tokensPerSecond: 3, chunkSize: 5 },
    })
  })

  test('stop button appears during loading and stops generation', async ({
    page,
  }) => {
    await page.goto('/openai/chat')

    await sendMessage(page, '[abort-test] tell me a long story')

    // Stop button should appear while loading
    const stopButton = page.getByTestId('stop-button')
    await expect(stopButton).toBeVisible({ timeout: 5000 })

    // Click stop
    await stopButton.click()

    // Stop button should disappear (loading = false)
    await expect(stopButton).not.toBeVisible({ timeout: 5000 })

    // Loading indicator should be gone
    await expect(page.getByTestId('loading-indicator')).not.toBeVisible()
  })

  test('response is incomplete after abort', async ({ page }) => {
    await page.goto('/openai/chat')

    await sendMessage(page, '[abort-test] tell me a long story')

    // Wait for some content to stream
    await page.waitForTimeout(2000)

    // Click stop
    await page.getByTestId('stop-button').click()
    await page.waitForTimeout(500)

    // Should have some assistant message content but not the complete response
    const msgs = page.getByTestId('assistant-message')
    const count = await msgs.count()
    if (count > 0) {
      const text = await msgs.last().innerText()
      // Response should exist but be shorter than the full ~230 char response
      expect(text.length).toBeLessThan(200)
    }

    // Should not be loading anymore
    await expect(page.getByTestId('loading-indicator')).not.toBeVisible()
  })
})
