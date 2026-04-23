import { test, expect, type Page } from '@playwright/test'

/**
 * Helper to navigate to the mock page with the thinking-multi-step scenario
 * and wait for hydration.
 */
async function goToThinkingScenario(page: Page) {
  await page.goto('/mock?scenario=thinking-multi-step')
  await page.waitForSelector('#chat-input', { timeout: 10000 })

  const input = page.locator('#chat-input')
  await expect(input).toBeEnabled({ timeout: 10000 })

  const chatPage = page.locator('[data-testid="chat-page"]')
  await expect(chatPage).toHaveAttribute(
    'data-mock-scenario',
    'thinking-multi-step',
  )

  await page.waitForLoadState('networkidle')
  await expect(page.locator('#submit-button')).toBeEnabled({ timeout: 5000 })
  await page.waitForTimeout(100)
}

async function sendAndWait(page: Page, message: string) {
  const input = page.locator('#chat-input')
  const submitButton = page.locator('#submit-button')
  const chatPage = page.locator('[data-testid="chat-page"]')

  await input.click()
  await input.fill('')
  await input.pressSequentially(message, { delay: 20 })
  await expect(input).toHaveValue(message, { timeout: 5000 })

  await submitButton.click()

  await expect(chatPage).toHaveAttribute('data-user-message-count', '1', {
    timeout: 5000,
  })
  await expect(submitButton).toHaveAttribute('data-is-loading', 'false', {
    timeout: 30000,
  })
  await expect(chatPage).toHaveAttribute('data-message-count', '2', {
    timeout: 10000,
  })
}

async function getMessages(page: Page): Promise<Array<any>> {
  const jsonContent = await page.locator('#messages-json-content').textContent()
  return JSON.parse(jsonContent || '[]')
}

/**
 * Chat E2E Tests - Multi-Step Thinking (Mock API)
 *
 * Verifies that thinking/reasoning events with distinct stepIds produce
 * separate ThinkingParts instead of being merged into one, and that
 * provider signatures are attached to the correct step.
 */
test.describe('Chat E2E Tests - Multi-Step Thinking (Mock API)', () => {
  test('should create one ThinkingPart per stepId, not merge them', async ({
    page,
  }) => {
    await goToThinkingScenario(page)
    await sendAndWait(page, 'Explain your reasoning')

    const chatPage = page.locator('[data-testid="chat-page"]')

    await expect(chatPage).toHaveAttribute('data-thinking-part-count', '2')
    await expect(chatPage).toHaveAttribute(
      'data-thinking-step-ids',
      'step-1,step-2',
    )

    const messages = await getMessages(page)
    const assistantMessage = messages[1]
    expect(assistantMessage.role).toBe('assistant')

    const thinkingParts = assistantMessage.parts.filter(
      (p: any) => p.type === 'thinking',
    )
    expect(thinkingParts).toHaveLength(2)

    const firstStep = thinkingParts.find((p: any) => p.stepId === 'step-1')
    expect(firstStep).toBeDefined()
    expect(firstStep.content).toBe(
      'First, I need to understand the question. ',
    )
    expect(firstStep.signature).toBe('sig-step-1')

    const secondStep = thinkingParts.find((p: any) => p.stepId === 'step-2')
    expect(secondStep).toBeDefined()
    expect(secondStep.content).toBe('Now I can answer.')
    expect(secondStep.signature).toBe('sig-step-2')
  })

  test('should keep the final text response alongside thinking steps', async ({
    page,
  }) => {
    await goToThinkingScenario(page)
    await sendAndWait(page, 'Explain your reasoning')

    const messages = await getMessages(page)
    const assistantMessage = messages[1]

    const textPart = assistantMessage.parts.find((p: any) => p.type === 'text')
    expect(textPart).toBeDefined()
    expect(textPart.content).toBe('Final answer.')

    const chatPage = page.locator('[data-testid="chat-page"]')
    await expect(chatPage).toHaveAttribute('data-has-tool-calls', 'false')
  })
})

test.afterEach(async ({ page }, testInfo) => {
  if (testInfo.status !== testInfo.expectedStatus) {
    await page.screenshot({
      path: `test-results/failure-${testInfo.title.replace(/\s+/g, '-')}.png`,
      fullPage: true,
    })
  }
})
