import { test, expect } from './fixtures'
import { sendMessage } from './helpers'

test.describe('Abort/Cancellation', () => {
  test.beforeEach(async ({ aimock }) => {
    // Add a slow-streaming fixture so there's time to click stop
    aimock.addFixture({
      match: { userMessage: '[abort-test] tell me a long story' },
      response: {
        content:
          'Once upon a time in a land far away there lived a guitar maker who spent decades perfecting the art of crafting beautiful instruments from the finest tonewoods available in the forests nearby and each guitar was unique and special and every single one had its own story to tell about the wood and the craftsmanship that went into making it a truly remarkable piece of art',
      },
      opts: { tokensPerSecond: 2, chunkSize: 3 },
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
})
