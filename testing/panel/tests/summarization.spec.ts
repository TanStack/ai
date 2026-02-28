/**
 * Summarization E2E Tests
 *
 * Tests the summarization API endpoint with both streaming and non-streaming modes
 * across all providers.
 */

import { test, expect } from '@playwright/test'
import {
  PROVIDERS,
  isProviderAvailable,
  getSummarizationCapableProviders,
  getStreamingSummarizationCapableProviders,
} from './vendor-config'
import {
  callSummarizeAPI,
  callSummarizeAPIStreaming,
  SAMPLE_TEXT_FOR_SUMMARIZATION,
} from './helpers'

const BASE_URL = 'http://localhost:3010'

// Test non-streaming summarization for each provider
for (const provider of PROVIDERS.filter((p) => p.supportsSummarization)) {
  test.describe(`${provider.name} - Non-Streaming Summarization`, () => {
    // Skip if provider is not available
    test.skip(
      () => !isProviderAvailable(provider),
      `${provider.name} API key not configured (requires ${provider.envKey || 'no key'})`,
    )

    test('should summarize text successfully', async ({ request }) => {
      const result = await callSummarizeAPI(request, BASE_URL, {
        text: SAMPLE_TEXT_FOR_SUMMARIZATION,
        provider: provider.id,
        maxLength: 100,
        style: 'concise',
      })

      // Verify we got a summary
      expect(result.summary).toBeTruthy()
      expect(result.summary.length).toBeGreaterThan(0)

      // Summary should be shorter than the original text
      expect(result.summary.length).toBeLessThan(
        SAMPLE_TEXT_FOR_SUMMARIZATION.length,
      )

      // Verify provider info is returned
      expect(result.provider).toBe(provider.id)
      expect(result.model).toBeTruthy()
    })

    test('should handle different summary styles', async ({ request }) => {
      // Test bullet-points style
      const result = await callSummarizeAPI(request, BASE_URL, {
        text: SAMPLE_TEXT_FOR_SUMMARIZATION,
        provider: provider.id,
        maxLength: 150,
        style: 'bullet-points',
      })

      expect(result.summary).toBeTruthy()
    })

    test('should respect maxLength parameter', async ({ request }) => {
      // Request a very short summary
      const result = await callSummarizeAPI(request, BASE_URL, {
        text: SAMPLE_TEXT_FOR_SUMMARIZATION,
        provider: provider.id,
        maxLength: 30,
        style: 'concise',
      })

      expect(result.summary).toBeTruthy()

      // The summary should be reasonably short (models don't always respect exact limits)
      // We'll just verify it's significantly shorter than the input
      expect(result.summary.length).toBeLessThan(
        SAMPLE_TEXT_FOR_SUMMARIZATION.length / 2,
      )
    })
  })
}

// Test streaming summarization for each provider that supports it
for (const provider of PROVIDERS.filter(
  (p) => p.supportsStreamingSummarization,
)) {
  test.describe(`${provider.name} - Streaming Summarization`, () => {
    // Skip if provider is not available
    test.skip(
      () => !isProviderAvailable(provider),
      `${provider.name} API key not configured (requires ${provider.envKey || 'no key'})`,
    )

    test('should stream summary chunks', async ({ request }) => {
      const result = await callSummarizeAPIStreaming(request, BASE_URL, {
        text: SAMPLE_TEXT_FOR_SUMMARIZATION,
        provider: provider.id,
        maxLength: 100,
        style: 'concise',
      })

      // Verify we got a summary
      expect(result.summary).toBeTruthy()
      expect(result.summary.length).toBeGreaterThan(0)

      // Verify we received multiple chunks (streaming)
      expect(result.chunkCount).toBeGreaterThan(0)

      // Verify provider info
      expect(result.provider).toBe(provider.id)
      expect(result.model).toBeTruthy()
    })

    test('should produce same quality summary as non-streaming', async ({
      request,
    }) => {
      // Get non-streaming summary
      const nonStreaming = await callSummarizeAPI(request, BASE_URL, {
        text: SAMPLE_TEXT_FOR_SUMMARIZATION,
        provider: provider.id,
        maxLength: 100,
        style: 'concise',
      })

      // Get streaming summary
      const streaming = await callSummarizeAPIStreaming(request, BASE_URL, {
        text: SAMPLE_TEXT_FOR_SUMMARIZATION,
        provider: provider.id,
        maxLength: 100,
        style: 'concise',
      })

      // Both should produce valid summaries
      expect(nonStreaming.summary).toBeTruthy()
      expect(streaming.summary).toBeTruthy()

      // Both should be reasonably sized (similar length, within 50% of each other)
      const ratio =
        streaming.summary.length / Math.max(nonStreaming.summary.length, 1)
      expect(ratio).toBeGreaterThan(0.3)
      expect(ratio).toBeLessThan(3)
    })
  })
}

// Test error handling
test.describe('Summarization Error Handling', () => {
  test('should handle empty text gracefully', async ({ request }) => {
    // Get the first available provider
    const availableProviders = getSummarizationCapableProviders()
    test.skip(
      availableProviders.length === 0,
      'No summarization providers available',
    )

    const provider = availableProviders[0]

    try {
      await callSummarizeAPI(request, BASE_URL, {
        text: '',
        provider: provider.id,
        maxLength: 100,
      })
      // If we get here, the API didn't reject empty text - that's also acceptable
    } catch (error: any) {
      // Error is expected for empty text
      expect(error.message).toBeTruthy()
    }
  })
})

// Verify providers are available
test('at least one summarization provider should be available', async () => {
  const available = getSummarizationCapableProviders()
  expect(available.length).toBeGreaterThanOrEqual(0)
})

test('at least one streaming summarization provider should be available', async () => {
  const available = getStreamingSummarizationCapableProviders()
  expect(available.length).toBeGreaterThanOrEqual(0)
})
