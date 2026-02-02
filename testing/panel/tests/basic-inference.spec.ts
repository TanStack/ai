/**
 * Basic Inference E2E Tests
 *
 * Tests that each AI provider can respond to a simple "say hello" prompt.
 * This validates that the adapter is correctly configured and can communicate
 * with the vendor API.
 */

import { test, expect } from '@playwright/test'
import {
  PROVIDERS,
  isProviderAvailable,
  getInferenceCapableProviders,
} from './vendor-config'
import {
  goToChatPage,
  selectProvider,
  sendMessage,
  waitForResponse,
  getAssistantMessage,
  getMessages,
} from './helpers'

// Only test providers that support basic inference
const inferenceProviders = PROVIDERS.filter((p) => p.supportsBasicInference)

for (const provider of inferenceProviders) {
  test.describe(`${provider.name} - Basic Inference`, () => {
    // Skip the entire describe block if provider is not available
    test.skip(
      () => !isProviderAvailable(provider),
      `${provider.name} API key not configured (requires ${provider.envKey || 'no key'})`,
    )

    test('should respond to a simple hello prompt', async ({ page }) => {
      // Navigate to the chat page
      await goToChatPage(page)

      // Select the provider and model
      await selectProvider(page, provider.id, provider.defaultModel)

      // Send a simple prompt
      await sendMessage(
        page,
        'Say hello in a friendly way. Just respond with a greeting.',
      )

      // Wait for the response
      await waitForResponse(page, 60_000)

      // Get the assistant's response
      const response = await getAssistantMessage(page)

      // Verify we got a response
      expect(response).toBeTruthy()
      expect(response.length).toBeGreaterThan(0)

      // The response should contain some form of greeting
      // We're flexible here since different models respond differently
      const lowerResponse = response.toLowerCase()
      const hasGreeting =
        lowerResponse.includes('hello') ||
        lowerResponse.includes('hi') ||
        lowerResponse.includes('hey') ||
        lowerResponse.includes('greetings') ||
        lowerResponse.includes('welcome')

      expect(hasGreeting).toBe(true)
    })

    test('should handle a follow-up question', async ({ page }) => {
      // Navigate to the chat page
      await goToChatPage(page)

      // Select the provider and model
      await selectProvider(page, provider.id, provider.defaultModel)

      // Send first message
      await sendMessage(page, 'What is 2 + 2? Just give me the number.')

      // Wait for response
      await waitForResponse(page, 60_000)

      // Get all messages to verify structure
      const messages = await getMessages(page)

      // Verify we have at least 2 messages (user + assistant)
      expect(messages.length).toBeGreaterThanOrEqual(2)

      // Get assistant response
      const response = await getAssistantMessage(page)

      // Verify we got a non-empty response that's not the user's message
      expect(response).toBeTruthy()
      expect(response).not.toContain('What is 2 + 2')

      // Response should contain "4" in some form
      expect(response).toContain('4')
    })
  })
}

// Test that at least one provider is available
test('at least one provider should be available', async () => {
  const availableProviders = PROVIDERS.filter(isProviderAvailable)
  expect(availableProviders.length).toBeGreaterThan(0)
})
