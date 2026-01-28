import { test, expect, Page } from '@playwright/test'

type MockScenario =
  | 'simple-text'
  | 'tool-call'
  | 'multi-tool'
  | 'text-tool-text'
  | 'error'

/**
 * Helper to navigate to mock page with a specific scenario
 */
async function goToMockScenario(page: Page, scenario: MockScenario) {
  await page.goto(`/mock?scenario=${scenario}`)
  await page.waitForSelector('#chat-input', { timeout: 10000 })

  // Wait for hydration by checking if input is interactive
  const input = page.locator('#chat-input')
  await expect(input).toBeEnabled({ timeout: 10000 })

  // Verify scenario is set
  const chatPage = page.locator('[data-testid="chat-page"]')
  await expect(chatPage).toHaveAttribute('data-mock-scenario', scenario)

  // Wait for network to be idle - this helps ensure all client-side code is loaded
  await page.waitForLoadState('networkidle')

  // Additional wait for React hydration - verify the submit button is also ready
  await expect(page.locator('#submit-button')).toBeEnabled({ timeout: 5000 })

  // Small delay to ensure event handlers are attached after hydration
  await page.waitForTimeout(100)
}

/**
 * Helper to send a message and wait for response
 */
async function sendMessageAndWait(
  page: Page,
  message: string,
  expectedMessageCount: number = 2,
) {
  const input = page.locator('#chat-input')
  const submitButton = page.locator('#submit-button')
  const chatPage = page.locator('[data-testid="chat-page"]')

  // Clear any existing value first
  await input.click()
  await input.fill('')

  // Use pressSequentially to properly trigger React state updates
  await input.pressSequentially(message, { delay: 20 })

  // Verify the input value was set
  await expect(input).toHaveValue(message, { timeout: 5000 })

  // Click submit
  await submitButton.click()

  // Wait for loading to START (user message should be added immediately)
  // Then wait for it to complete
  await expect(chatPage).toHaveAttribute('data-user-message-count', '1', {
    timeout: 5000,
  })

  // Wait for loading to complete
  await expect(submitButton).toHaveAttribute('data-is-loading', 'false', {
    timeout: 30000,
  })

  // Wait for messages to be populated
  await expect(chatPage).toHaveAttribute(
    'data-message-count',
    expectedMessageCount.toString(),
    { timeout: 10000 },
  )
}

/**
 * Helper to parse messages from the JSON display
 */
async function getMessages(page: Page): Promise<Array<any>> {
  const jsonContent = await page.locator('#messages-json-content').textContent()
  return JSON.parse(jsonContent || '[]')
}

/**
 * Chat E2E Tests - UI Presence
 *
 * These tests verify the chat UI loads and elements are present.
 */
test.describe('Chat E2E Tests - UI Presence', () => {
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
    await input.fill('Hello, world!')
    await expect(input).toHaveValue('Hello, world!')
  })

  test('should have submit button with correct attributes', async ({
    page,
  }) => {
    await page.goto('/')
    await page.waitForSelector('#chat-input', { timeout: 10000 })

    const submitButton = page.locator('#submit-button')
    await expect(submitButton).toBeVisible()
    const dataIsLoading = await submitButton.getAttribute('data-is-loading')
    expect(dataIsLoading).toBe('false')
  })

  test('should display mock page with scenario from URL', async ({ page }) => {
    await page.goto('/mock?scenario=tool-call')
    await page.waitForSelector('#chat-input', { timeout: 10000 })

    const chatPage = page.locator('[data-testid="chat-page"]')
    await expect(chatPage).toHaveAttribute('data-mock-scenario', 'tool-call')
    await expect(page.locator('#chat-input')).toBeVisible()
    await expect(page.locator('#submit-button')).toBeVisible()
  })
})

/**
 * Chat E2E Tests - Text Flow with Mock API
 *
 * These tests verify the full text message flow using deterministic mock responses.
 */
test.describe('Chat E2E Tests - Text Flow (Mock API)', () => {
  test('should send message and receive simple text response', async ({
    page,
  }) => {
    await goToMockScenario(page, 'simple-text')
    await sendMessageAndWait(page, 'Hello')

    const messages = await getMessages(page)

    // Should have user message and assistant message
    expect(messages.length).toBe(2)

    // Verify user message
    const userMessage = messages[0]
    expect(userMessage.role).toBe('user')
    expect(userMessage.parts).toContainEqual({
      type: 'text',
      content: 'Hello',
    })

    // Verify assistant message has text part
    const assistantMessage = messages[1]
    expect(assistantMessage.role).toBe('assistant')

    const textPart = assistantMessage.parts.find((p: any) => p.type === 'text')
    expect(textPart).toBeDefined()
    expect(textPart.content).toContain('Hello!')
    expect(textPart.content).toContain('mock response')
  })

  test('should update data attributes correctly after message', async ({
    page,
  }) => {
    await goToMockScenario(page, 'simple-text')
    await sendMessageAndWait(page, 'Test message')

    const chatPage = page.locator('[data-testid="chat-page"]')

    // Verify data attributes
    await expect(chatPage).toHaveAttribute('data-message-count', '2')
    await expect(chatPage).toHaveAttribute('data-user-message-count', '1')
    await expect(chatPage).toHaveAttribute('data-assistant-message-count', '1')
    await expect(chatPage).toHaveAttribute('data-has-tool-calls', 'false')
    await expect(chatPage).toHaveAttribute('data-tool-call-count', '0')
  })
})

/**
 * Chat E2E Tests - Tool Call Flow with Mock API
 *
 * These tests verify tool call handling using deterministic mock responses.
 */
test.describe('Chat E2E Tests - Tool Call Flow (Mock API)', () => {
  test('should handle single tool call response', async ({ page }) => {
    await goToMockScenario(page, 'tool-call')
    await sendMessageAndWait(page, 'What is the weather?')

    const messages = await getMessages(page)

    // Should have user message and assistant message
    expect(messages.length).toBe(2)

    // Verify assistant message has tool-call part
    const assistantMessage = messages[1]
    expect(assistantMessage.role).toBe('assistant')

    const toolCallPart = assistantMessage.parts.find(
      (p: any) => p.type === 'tool-call',
    )
    expect(toolCallPart).toBeDefined()
    expect(toolCallPart.name).toBe('get_weather')
    expect(toolCallPart.id).toBe('mock-tc-1')

    // Verify data attributes
    const chatPage = page.locator('[data-testid="chat-page"]')
    await expect(chatPage).toHaveAttribute('data-has-tool-calls', 'true')
    await expect(chatPage).toHaveAttribute('data-tool-call-count', '1')
    await expect(chatPage).toHaveAttribute('data-tool-names', 'get_weather')
  })

  test('should handle multiple parallel tool calls', async ({ page }) => {
    await goToMockScenario(page, 'multi-tool')
    await sendMessageAndWait(page, 'Weather and time please')

    const messages = await getMessages(page)
    const assistantMessage = messages[1]

    // Should have 2 tool-call parts
    const toolCallParts = assistantMessage.parts.filter(
      (p: any) => p.type === 'tool-call',
    )
    expect(toolCallParts.length).toBe(2)

    // Verify tool names
    const toolNames = toolCallParts.map((p: any) => p.name)
    expect(toolNames).toContain('get_weather')
    expect(toolNames).toContain('get_time')

    // Verify data attributes
    const chatPage = page.locator('[data-testid="chat-page"]')
    await expect(chatPage).toHaveAttribute('data-tool-call-count', '2')
  })

  test('should handle text followed by tool call', async ({ page }) => {
    await goToMockScenario(page, 'text-tool-text')
    await sendMessageAndWait(page, 'Check weather in Paris')

    const messages = await getMessages(page)
    const assistantMessage = messages[1]

    // Should have both text and tool-call parts
    const textPart = assistantMessage.parts.find((p: any) => p.type === 'text')
    const toolCallPart = assistantMessage.parts.find(
      (p: any) => p.type === 'tool-call',
    )

    expect(textPart).toBeDefined()
    expect(textPart.content).toContain('Let me check the weather')

    expect(toolCallPart).toBeDefined()
    expect(toolCallPart.name).toBe('get_weather')

    // Verify data attributes show both
    const chatPage = page.locator('[data-testid="chat-page"]')
    await expect(chatPage).toHaveAttribute('data-has-tool-calls', 'true')
  })

  test('should verify tool call arguments are correctly parsed', async ({
    page,
  }) => {
    await goToMockScenario(page, 'tool-call')
    await sendMessageAndWait(page, 'Weather check')

    const messages = await getMessages(page)
    const assistantMessage = messages[1]

    const toolCallPart = assistantMessage.parts.find(
      (p: any) => p.type === 'tool-call',
    )

    // Arguments should be a JSON string
    expect(toolCallPart.arguments).toBeDefined()
    const args = JSON.parse(toolCallPart.arguments)
    expect(args.city).toBe('New York')
  })
})

/**
 * Chat E2E Tests - Error Handling with Mock API
 */
test.describe('Chat E2E Tests - Error Handling (Mock API)', () => {
  test('should handle error response gracefully', async ({ page }) => {
    await goToMockScenario(page, 'error')

    // Error scenario produces user message + assistant message (with error)
    await sendMessageAndWait(page, 'Trigger error', 2)

    // The chat page should have both messages
    const messages = await getMessages(page)
    expect(messages.length).toBe(2)
    expect(messages[0].role).toBe('user')
    expect(messages[1].role).toBe('assistant')

    // Verify error state is set
    const chatPage = page.locator('[data-testid="chat-page"]')
    await expect(chatPage).toHaveAttribute('data-has-error', 'true')
  })
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
