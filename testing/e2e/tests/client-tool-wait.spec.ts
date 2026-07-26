import { SpanKind } from '@opentelemetry/api'
import { test, expect } from './fixtures'
import type { Page } from '@playwright/test'

function buildHarnessUrl(testId?: string, aimockPort?: number): string {
  const params = new URLSearchParams()
  if (testId) params.set('testId', testId)
  if (aimockPort) params.set('aimockPort', String(aimockPort))
  const qs = params.toString()
  return `/middleware-test${qs ? '?' + qs : ''}`
}

async function readMessages(page: Page) {
  const raw = await page.locator('#mw-messages-json').textContent()
  return JSON.parse(raw || '[]')
}

test.describe('Client-tool wait lifecycle', () => {
  test('ends the waiting invocation and finalizes structured output only after the client result', async ({
    page,
    testId,
    aimockPort,
    baseURL,
  }) => {
    await page.goto(buildHarnessUrl(testId, aimockPort))
    await page.waitForTimeout(2000)

    await page
      .locator('#mw-scenario-select')
      .selectOption('structured-client-tool-wait')
    await page.locator('#mw-mode-select').selectOption('otel')
    await page.locator('#mw-run-button').click()

    await page.waitForFunction(
      () =>
        document
          .querySelector('#mw-metadata')
          ?.getAttribute('data-client-tool-waiting') === 'true',
      { timeout: 15000 },
    )

    expect(await page.locator('#mw-error').textContent()).toBe('')
    const waitingMessages = await readMessages(page)
    const prematureStructuredParts = waitingMessages.flatMap((message: any) =>
      message.parts.filter((part: any) => part.type === 'structured-output'),
    )
    expect(prematureStructuredParts).toHaveLength(0)

    if (!testId) throw new Error('client-tool wait test requires testId')
    const captureResponse = await page.request.get(
      `${baseURL ?? ''}/api/middleware-test?testId=${encodeURIComponent(testId)}`,
    )
    expect(captureResponse.ok()).toBe(true)
    const capture = await captureResponse.json()

    const rootSpans = capture.spans.filter(
      (span: any) => span.kind === SpanKind.INTERNAL,
    )
    expect(rootSpans).toHaveLength(1)
    expect(rootSpans[0].ended).toBe(true)

    const iterationSpans = capture.spans.filter(
      (span: any) => span.kind === SpanKind.CLIENT,
    )
    expect(iterationSpans).toHaveLength(1)
    expect(iterationSpans[0].ended).toBe(true)

    const durationRecords = capture.histograms.filter(
      (record: any) => record.name === 'gen_ai.client.operation.duration',
    )
    expect(durationRecords).toHaveLength(1)

    await page.locator('#mw-client-tool-resolve').click()

    await expect
      .poll(
        async () => {
          const messages = await readMessages(page)
          for (const message of messages) {
            for (const part of message.parts ?? []) {
              if (
                part.type === 'structured-output' &&
                part.status === 'complete'
              ) {
                return part.data
              }
            }
          }
          return null
        },
        { timeout: 15000 },
      )
      .toEqual({
        name: 'Client Context Guitar',
        price: 999,
        reason: 'Recommended using client-result',
        rating: 5,
      })

    expect(await page.locator('#mw-error').textContent()).toBe('')
  })
})
