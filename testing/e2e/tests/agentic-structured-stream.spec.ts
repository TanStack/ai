import { test, expect } from './fixtures'
import {
  featureUrl,
  getToolCalls,
  sendMessage,
  waitForAssistantText,
  waitForResponse,
} from './helpers'
import { providersFor } from './test-matrix'

/**
 * Per-provider coverage for #605 native combined-mode: `outputSchema` +
 * `tools` + `stream: true` in a single chat call. The matrix is restricted
 * to providers whose adapter declares `supportsCombinedToolsAndSchema`
 * for the default (or feature-overridden) test model — see
 * `feature-support.ts` and `features.ts`. The contracts below also hold for
 * the legacy fallback path, but adding non-native-combined providers here
 * would require an extra fixture sequence entry for the engine's
 * `runStructuredFinalization` request, which is out of scope.
 *
 * Observable contracts pinned per provider:
 *   1. A `getGuitars` tool call lands during the agent loop.
 *   2. The schema-constrained final-turn content lands as a typed
 *      `structured-output` part on the assistant message (NOT a text part).
 *      Confirms the engine's synthetic `structured-output.start` reached
 *      the client and routed subsequent TEXT_MESSAGE_CONTENT deltas into a
 *      StructuredOutputPart.
 *   3. The `structured-output.complete` custom event reaches the client
 *      with the parsed object matching the schema.
 *   4. The content streamed (more than one TEXT_MESSAGE_CONTENT delta).
 */
for (const provider of providersFor('agentic-structured-stream')) {
  test.describe(`${provider} — agentic-structured-stream`, () => {
    test('streams tool calls and a schema-validated final message in one chat call', async ({
      page,
      testId,
      aimockPort,
    }) => {
      // Raise the per-test cap (config default 30s) so the generous
      // `structured-output-part` wait below isn't cut short by the test-level
      // timeout under parallel-worker dev-server contention.
      test.setTimeout(60_000)

      await page.goto(
        featureUrl(provider, 'agentic-structured-stream', testId, aimockPort),
      )
      // Confirms useChat has hydrated before we send — under parallel workers
      // the first POST can otherwise race React hydration and lose the
      // synthetic `structured-output.start` event ordering at the processor.
      await page.getByTestId('chat-input').waitFor({ state: 'visible' })

      await sendMessage(page, '[agentic-stream] check inventory and recommend')
      await waitForResponse(page)

      const toolCalls = await getToolCalls(page)
      expect(toolCalls.map((c) => c.name)).toContain('getGuitars')

      await waitForAssistantText(page, 'Fender Stratocaster')

      // Anchor on `structured-output-complete` first — this testid only
      // renders after `useChat`'s `onCustomEvent('structured-output.complete')`
      // fired. `waitForResponse` keys on `isLoading` flipping false
      // (RUN_FINISHED), which can land before the React tree re-renders the
      // streaming TextPart → completed StructuredOutputPart.
      const completeEl = page.getByTestId('structured-output-complete')
      await expect(completeEl).toBeAttached({ timeout: 10_000 })

      // Use a longer timeout — under parallel-worker dev-server contention
      // the final React commit landing the structured-output part can lag
      // well behind the `structured-output.complete` testid attachment (the
      // `structured-output.complete` event has already arrived; only the React
      // commit that swaps the streaming text part for the completed
      // StructuredOutputPart is outstanding, so a generous wait is safe).
      const assistantMessage = page.getByTestId('assistant-message').last()
      await expect(
        assistantMessage.getByTestId('structured-output-part'),
      ).toHaveCount(1, { timeout: 30_000 })

      const structuredAttr = await completeEl.getAttribute(
        'data-structured-output',
      )
      expect(structuredAttr).toBeTruthy()
      const parsed = JSON.parse(structuredAttr!) as {
        name: string
        price: number
        rating: number
      }
      expect(parsed.name).toContain('Fender Stratocaster')
      expect(parsed.price).toBe(1299)
      expect(parsed.rating).toBe(5)

      const countAttr = await page
        .getByTestId('content-delta-count')
        .getAttribute('data-count')
      expect(Number(countAttr)).toBeGreaterThan(1)
    })
  })
}
