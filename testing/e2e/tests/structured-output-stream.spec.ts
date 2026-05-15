import { test, expect } from './fixtures'
import {
  sendMessage,
  waitForResponse,
  getLastAssistantMessage,
  featureUrl,
} from './helpers'
import { providersFor } from './test-matrix'

for (const provider of providersFor('structured-output-stream')) {
  test.describe(`${provider} — structured-output-stream`, () => {
    test('streams structured JSON deltas in a single request', async ({
      page,
      testId,
      aimockPort,
    }) => {
      await page.goto(
        featureUrl(provider, 'structured-output-stream', testId, aimockPort),
      )

      await sendMessage(page, '[structured-stream] recommend a guitar as json')
      await waitForResponse(page)

      const response = await getLastAssistantMessage(page)
      expect(response).toContain('Fender Stratocaster')
      expect(response).toContain('1299')

      // Verify the terminal `structured-output.complete` CUSTOM event
      // reached the client and carries the parsed object — protects against
      // a regression where the event is dropped but the JSON text still
      // happens to render.
      const completeEl = page.getByTestId('structured-output-complete')
      await expect(completeEl).toBeAttached()
      const structuredAttr = await completeEl.getAttribute(
        'data-structured-output',
      )
      expect(structuredAttr).toBeTruthy()
      const parsed = JSON.parse(structuredAttr!)
      expect(parsed.name).toContain('Fender Stratocaster')
      expect(parsed.price).toBe(1299)

      // Verify the response actually streamed (more than one content delta).
      // A regression that silently fell back to the synthetic single-delta
      // path would still pass the substring assertion above but fail here.
      const countAttr = await page
        .getByTestId('content-delta-count')
        .getAttribute('data-count')
      expect(Number(countAttr)).toBeGreaterThan(1)
    })

    test('aborting mid-stream stops the run cleanly', async ({
      page,
      testId,
      aimockPort,
    }) => {
      await page.goto(
        featureUrl(provider, 'structured-output-stream', testId, aimockPort),
      )

      // Uses the slow-streaming fixture (tokensPerSecond + small chunkSize)
      // so the stop button is reliably visible mid-stream.
      await sendMessage(
        page,
        '[structured-stream-abort] recommend a guitar slowly',
      )

      await expect(page.getByTestId('loading-indicator')).toBeVisible({
        timeout: 10_000,
      })

      const stopButton = page.getByTestId('stop-button')
      await expect(stopButton).toBeVisible({ timeout: 5_000 })
      await stopButton.click()

      await expect(page.getByTestId('loading-indicator')).not.toBeVisible({
        timeout: 10_000,
      })

      // The structured-output.complete event must not have reached the
      // client — aborting before the JSON finished streaming should leave
      // the run terminated, not "completed with empty result".
      await expect(page.getByTestId('structured-output-complete')).toHaveCount(
        0,
      )
    })
  })
}
