import { test, expect } from '@playwright/test'

/**
 * Chat E2E Tests using LLM Simulator
 *
 * These tests verify the chat UI loads and elements are present.
 */
test.describe('Chat E2E Tests', () => {
  test('should display the chat page correctly', async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('#chat-input', { timeout: 10000 })

    await expect(page.locator('#chat-input')).toBeVisible()
    await expect(page.locator('#submit-button')).toBeVisible()
    await expect(page.locator('#messages-json-content')).toBeVisible()
  })

  test('should allow typing in the input field', async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('#chat-input', { timeout: 10000 })

    const input = page.locator('#chat-input')

    // Type a message
    await input.fill('Hello, world!')

    // Verify the input value
    await expect(input).toHaveValue('Hello, world!')
  })

  test('should have submit button with correct attributes', async ({
    page,
  }) => {
    await page.goto('/')
    await page.waitForSelector('#chat-input', { timeout: 10000 })

    const submitButton = page.locator('#submit-button')

    // Verify button is present and has expected attributes
    await expect(submitButton).toBeVisible()
    const dataIsLoading = await submitButton.getAttribute('data-is-loading')
    expect(dataIsLoading).toBe('false')
  })

  // Take screenshot on failure for debugging
  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus) {
      await page.screenshot({
        path: `test-results/failure-${testInfo.title.replace(/\s+/g, '-')}.png`,
        fullPage: true,
      })
    }
  })
})
