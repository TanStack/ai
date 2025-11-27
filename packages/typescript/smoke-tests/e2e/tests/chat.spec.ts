import { test, expect } from '@playwright/test'

test.describe('Chat E2E Tests', () => {
  test('should handle two-prompt conversation with context', async ({
    page,
  }) => {
    await page.goto('/')

    // Take screenshot after navigation
    await page.screenshot({
      path: 'test-results/01-after-navigation.png',
      fullPage: true,
    })

    // Wait for the page to load with timeout and screenshot on failure
    try {
      await page.waitForSelector('#chat-input', { timeout: 10000 })
    } catch (error) {
      await page.screenshot({
        path: 'test-results/02-wait-for-input-failed.png',
        fullPage: true,
      })
      console.log('Page content:', await page.content())
      console.log('Page URL:', page.url())
      throw error
    }

    // Take screenshot after input is found
    await page.screenshot({
      path: 'test-results/03-input-found.png',
      fullPage: true,
    })

    // First prompt: Ask about the capital of France
    const input = page.locator('#chat-input')
    const submitButton = page.locator('#submit-button')
    const messagesJson = page.locator('#messages-json-content')

    // Clear input and type with delay to trigger React events properly
    await input.clear()
    await input.pressSequentially('What is the capital of France?', {
      delay: 50,
    })
    // Small wait for React state to sync
    await page.waitForTimeout(100)
    // Click button (more reliable than Enter key)
    await submitButton.click()

    // Take screenshot after submitting first message
    await page.screenshot({
      path: 'test-results/04-first-message-sent.png',
      fullPage: true,
    })

    // Wait for the response to appear in the JSON and verify Paris is in it
    await page.waitForFunction(
      () => {
        const preElement = document.querySelector('#messages-json-content')
        if (!preElement) return false
        try {
          const messages = JSON.parse(preElement.textContent || '[]')
          const assistantMessages = messages.filter(
            (m: any) => m.role === 'assistant',
          )
          if (assistantMessages.length > 0) {
            const lastMessage = assistantMessages[assistantMessages.length - 1]
            const textParts = lastMessage.parts.filter(
              (p: any) => p.type === 'text' && p.content,
            )
            if (textParts.length > 0) {
              const content = textParts.map((p: any) => p.content).join(' ')
              return content.toLowerCase().includes('paris')
            }
          }
          return false
        } catch {
          return false
        }
      },
      { timeout: 60000 },
    )

    // Verify Paris is in the response
    const messagesText1 = await messagesJson.textContent()
    const messages1 = JSON.parse(messagesText1 || '[]')
    const assistantMessage1 = messages1
      .filter((m: any) => m.role === 'assistant')
      .pop()
    const textContent1 = assistantMessage1.parts
      .filter((p: any) => p.type === 'text' && p.content)
      .map((p: any) => p.content)
      .join(' ')
      .toLowerCase()

    expect(textContent1).toContain('paris')

    // Take screenshot after first response received
    await page.screenshot({
      path: 'test-results/05-first-response-received.png',
      fullPage: true,
    })

    // Second prompt: Follow-up question about population
    // Wait for loading to complete (isLoading becomes false)
    await page.waitForFunction(
      () => {
        const button = document.querySelector(
          '#submit-button',
        ) as HTMLButtonElement
        const isLoading = button?.getAttribute('data-is-loading') === 'true'
        return button && !isLoading
      },
      { timeout: 30000 },
    )
    // Clear input and type with delay to trigger React events properly
    await input.clear()
    await input.pressSequentially('What is the population of that city?', {
      delay: 50,
    })
    // Small wait for React state to sync
    await page.waitForTimeout(100)
    // Click button (more reliable than Enter key)
    await submitButton.click()

    // Take screenshot after submitting second message
    await page.screenshot({
      path: 'test-results/06-second-message-sent.png',
      fullPage: true,
    })

    // Wait for the response to appear in the JSON and verify "million" is in it
    await page.waitForFunction(
      () => {
        const preElement = document.querySelector('#messages-json-content')
        if (!preElement) return false
        try {
          const messages = JSON.parse(preElement.textContent || '[]')
          const assistantMessages = messages.filter(
            (m: any) => m.role === 'assistant',
          )
          // Should have at least 2 assistant messages now
          if (assistantMessages.length >= 2) {
            const lastMessage = assistantMessages[assistantMessages.length - 1]
            const textParts = lastMessage.parts.filter(
              (p: any) => p.type === 'text' && p.content,
            )
            if (textParts.length > 0) {
              const content = textParts.map((p: any) => p.content).join(' ')
              return content.toLowerCase().includes('million')
            }
          }
          return false
        } catch {
          return false
        }
      },
      { timeout: 60000 },
    )

    // Verify "million" is in the response (indicating context was maintained)
    const messagesText2 = await messagesJson.textContent()
    const messages2 = JSON.parse(messagesText2 || '[]')
    const assistantMessage2 = messages2
      .filter((m: any) => m.role === 'assistant')
      .pop()
    const textContent2 = assistantMessage2.parts
      .filter((p: any) => p.type === 'text' && p.content)
      .map((p: any) => p.content)
      .join(' ')
      .toLowerCase()

    expect(textContent2).toContain('million')

    // Verify we have the full conversation context
    expect(messages2.length).toBeGreaterThanOrEqual(4) // At least 2 user + 2 assistant messages

    // Take final screenshot
    await page.screenshot({
      path: 'test-results/07-test-complete.png',
      fullPage: true,
    })
  })

  // Add a hook to take screenshot on test failure
  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus) {
      await page.screenshot({
        path: `test-results/failure-${testInfo.title.replace(/\s+/g, '-')}.png`,
        fullPage: true,
      })
    }
  })
})
