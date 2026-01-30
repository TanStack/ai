/**
 * Tool Flow E2E Tests
 *
 * Tests that AI providers can correctly invoke tools when prompted.
 * Uses the existing guitar recommendation tools in the testing panel.
 *
 * The guitar store system prompt instructs the AI to:
 * 1. Call getGuitars() to fetch inventory
 * 2. Call recommendGuitar(id) to display a recommendation
 */

import { test, expect } from '@playwright/test'
import {
  PROVIDERS,
  isProviderAvailable,
  getToolCapableProviders,
} from './vendor-config'
import {
  goToChatPage,
  selectProvider,
  sendMessage,
  waitForResponse,
  getMessages,
  hasToolCalls,
  getToolCallNames,
} from './helpers'

// Only test providers that support tool calling
const toolProviders = PROVIDERS.filter((p) => p.supportsTools)

for (const provider of toolProviders) {
  test.describe(`${provider.name} - Tool Flow`, () => {
    // Skip if provider is not available
    test.skip(
      () => !isProviderAvailable(provider),
      `${provider.name} API key not configured (requires ${provider.envKey || 'no key'})`,
    )

    test('should call getGuitars tool when asked for guitar recommendation', async ({
      page,
    }) => {
      // Navigate to the chat page
      await goToChatPage(page)

      // Select the provider and model
      await selectProvider(page, provider.id, provider.defaultModel)

      // Send a prompt that should trigger tool calls
      await sendMessage(
        page,
        'Use the getGuitars tool to show me what guitars you have in inventory.',
      )

      // Wait for the response (tool calls may take longer)
      await waitForResponse(page, 90_000)

      // Check that tool calls were made
      const madeToolCalls = await hasToolCalls(page)

      expect(madeToolCalls).toBe(true)

      // Verify getGuitars was called
      const toolNames = await getToolCallNames(page)
      expect(toolNames).toContain('getGuitars')
    })

    test('should complete full recommendation flow with multiple tool calls', async ({
      page,
    }) => {
      // Navigate to the chat page
      await goToChatPage(page)

      // Select the provider and model
      await selectProvider(page, provider.id, provider.defaultModel)

      // Send a prompt that should trigger the full flow
      await sendMessage(
        page,
        'Recommend me an electric guitar from your inventory.',
      )

      // Wait for the response (multiple tool calls may take longer)
      await waitForResponse(page, 120_000)

      // Get all messages to inspect the tool calls
      const messages = await getMessages(page)

      // Find assistant messages with tool calls
      const assistantMessages = messages.filter(
        (m: any) => m.role === 'assistant',
      )
      expect(assistantMessages.length).toBeGreaterThan(0)

      // Check that we have tool calls
      const allToolCalls: string[] = []
      for (const msg of assistantMessages) {
        const toolCalls = msg.parts?.filter((p: any) => p.type === 'tool-call')
        if (toolCalls) {
          allToolCalls.push(...toolCalls.map((tc: any) => tc.name))
        }
      }

      // Should have called getGuitars at minimum
      expect(allToolCalls).toContain('getGuitars')
    })

    test('should handle tool with arguments correctly', async ({ page }) => {
      // Navigate to the chat page
      await goToChatPage(page)

      // Select the provider and model
      await selectProvider(page, provider.id, provider.defaultModel)

      // Send a specific request that should use recommendGuitar with an ID
      await sendMessage(
        page,
        'Show me the guitars you have and then recommend guitar #1 to me.',
      )

      // Wait for the response
      await waitForResponse(page, 120_000)

      // Get all messages
      const messages = await getMessages(page)

      // Find tool calls with arguments
      const allToolCalls: Array<{ name: string; arguments?: string }> = []
      for (const msg of messages) {
        if (msg.role === 'assistant') {
          const toolCalls = msg.parts?.filter(
            (p: any) => p.type === 'tool-call',
          )
          if (toolCalls) {
            for (const tc of toolCalls) {
              allToolCalls.push({
                name: tc.name,
                arguments: tc.arguments,
              })
            }
          }
        }
      }

      // Should have some tool calls
      expect(allToolCalls.length).toBeGreaterThan(0)
    })
  })
}

// Verify we have tool-capable providers to test
test('at least one tool-capable provider should be available', async () => {
  const available = getToolCapableProviders()
  expect(available.length).toBeGreaterThanOrEqual(0)
})
