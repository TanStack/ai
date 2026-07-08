import { test, expect } from './fixtures'
import { featureUrl } from './helpers'

// Fixture is loaded from fixtures/abort/basic.json (static, shared across workers)

test.describe('Abort/Cancellation', () => {
  test('stop button appears during loading and stops generation', async ({
    page,
    testId,
    aimockPort,
  }) => {
    await page.goto(featureUrl('openai', 'chat', testId, aimockPort))

    // Type and send
    const input = page.getByTestId('chat-input')
    await input.click()
    await input.fill('[abort-test] tell me a long story')
    await input.dispatchEvent('input', { bubbles: true })
    await page
      .getByTestId('send-button')
      .click({ timeout: 5000 })
      .catch(async () => {
        const isDisabled = await page.getByTestId('send-button').isDisabled()
        if (!isDisabled) throw new Error('Send button click failed')
        await input.clear()
        await input.pressSequentially('[abort-test] tell me a long story', {
          delay: 30,
        })
        await page.getByTestId('send-button').click()
      })

    // Wait for loading to start (proves the request was sent)
    await expect(page.getByTestId('loading-indicator')).toBeVisible({
      timeout: 10000,
    })

    // Stop button should be visible during loading
    const stopButton = page.getByTestId('stop-button')
    await expect(stopButton).toBeVisible({ timeout: 5000 })

    // Click stop
    await stopButton.click()

    // Loading should stop
    await expect(page.getByTestId('loading-indicator')).not.toBeVisible({
      timeout: 10000,
    })

    // Stop button should disappear
    await expect(stopButton).not.toBeVisible()
  })
})
