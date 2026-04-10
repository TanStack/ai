import { test, expect } from './fixtures'
import { selectScenario, runTest, getMetadata } from './tools-test/helpers'
import { sendMessage, featureUrl } from './helpers'

test.describe('Error Handling', () => {
  test('displays error when server returns RUN_ERROR', async ({
    page,
    testId,
    aimockPort,
  }) => {
    await selectScenario(page, 'error', testId, aimockPort)
    await runTest(page)

    // Wait for error to appear
    await page.waitForFunction(
      () =>
        document
          .querySelector('#test-metadata')
          ?.getAttribute('data-has-error') === 'true',
      { timeout: 10000 },
    )

    const metadata = await getMetadata(page)
    expect(metadata.hasError).toBe('true')
    expect(metadata.isLoading).toBe('false')

    // Error should be visible in UI
    await expect(page.locator('#error-display')).toBeVisible()
  })

  // Fixture loaded from fixtures/error/basic.json (static, shared across workers)
  test('aimock error fixture returns error to client', async ({
    page,
    testId,
    aimockPort,
  }) => {
    await page.goto(featureUrl('openai', 'chat', testId, aimockPort))

    await sendMessage(page, '[error-test] trigger server error')

    // Wait for loading to finish (error completes the stream)
    await page.waitForTimeout(5000)

    // Should not be loading
    await expect(page.getByTestId('loading-indicator')).not.toBeVisible()

    // Error response should not produce a normal assistant message with content
    const assistantMsgs = page.getByTestId('assistant-message')
    const count = await assistantMsgs.count()
    if (count > 0) {
      const text = await assistantMsgs.last().innerText()
      expect(text).not.toContain('recommend')
      expect(text).not.toContain('guitar')
    }
  })
})
