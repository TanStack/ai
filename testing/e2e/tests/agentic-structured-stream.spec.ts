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
 *   2. The schema-constrained final-turn content reaches the assistant
 *      message (asserted via substring; the typed `structured-output`
 *      part routing through useChat is a separate concern tracked under
 *      the multi-turn-structured Anthropic exclusion in
 *      `feature-support.ts`).
 *   3. The `structured-output.complete` custom event reaches the client
 *      with the parsed object matching the schema. This is the
 *      load-bearing contract — engine harvested the JSON, validated it
 *      against the Standard Schema, and surfaced it through the synthetic
 *      lifecycle. Whether the assistant message renders it as a typed
 *      `structured-output` part vs a `text` part doesn't affect the
 *      structured-output value delivered to consumers.
 *   4. The content streamed (more than one TEXT_MESSAGE_CONTENT delta),
 *      guarding against silent collapse to a single synthetic chunk.
 */
for (const provider of providersFor('agentic-structured-stream')) {
  test.describe(`${provider} — agentic-structured-stream`, () => {
    test('streams tool calls and a schema-validated final message in one chat call', async ({
      page,
      testId,
      aimockPort,
    }) => {
      await page.goto(
        featureUrl(provider, 'agentic-structured-stream', testId, aimockPort),
      )

      await sendMessage(page, '[agentic-stream] check inventory and recommend')
      await waitForResponse(page)

      const toolCalls = await getToolCalls(page)
      expect(toolCalls.map((c) => c.name)).toContain('getGuitars')

      await waitForAssistantText(page, 'Fender Stratocaster')

      const completeEl = page.getByTestId('structured-output-complete')
      await expect(completeEl).toBeAttached()
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
