import { test, expect } from './fixtures'
import type { Page } from '@playwright/test'
import {
  getLastAssistantMessage,
  sendMessage,
  waitForResponse,
} from './helpers'
import { providersFor } from './test-matrix'

// The transaction feature has its own dedicated page (`/transaction`) that
// drives `useTransaction`, which posts to the `/api/transaction` handler —
// NOT the generic matrix page (`/$provider/$feature` → `/api/chat`). So we
// navigate directly rather than via `featureUrl`, exercising the real
// defineTransaction/useTransaction path end to end.
function transactionUrl(provider: string, testId: string, aimockPort: number) {
  const params = new URLSearchParams({
    provider,
    testId,
    aimockPort: String(aimockPort),
  })
  return `/transaction?${params.toString()}`
}

/**
 * Click a run button once the page is hydrated. A click that lands before
 * React hydration is a silent no-op, so verify the verb's status left
 * 'idle' and retry once if it didn't (mirrors `clickGenerate` in helpers).
 */
async function clickRun(
  page: Page,
  buttonTestId: string,
  statusTestId: string,
) {
  await page.waitForLoadState('networkidle')
  const btn = page.getByTestId(buttonTestId)
  await btn.click()
  try {
    await expect(page.getByTestId(statusTestId)).not.toHaveText('idle', {
      timeout: 3_000,
    })
  } catch {
    // Retry click — hydration likely wasn't complete on first attempt
    await btn.click()
  }
}

for (const provider of providersFor('transaction')) {
  test.describe(`${provider} — transaction`, () => {
    test('chat verb streams through useTransaction + the transaction handler', async ({
      page,
      testId,
      aimockPort,
    }) => {
      await page.goto(transactionUrl(provider, testId, aimockPort))

      await sendMessage(page, '[transaction] recommend a guitar')
      await waitForResponse(page)

      const response = await getLastAssistantMessage(page)
      expect(response).toContain('Fender Stratocaster')
    })

    test('one-shot verb run() renders its result', async ({
      page,
      testId,
      aimockPort,
    }) => {
      await page.goto(transactionUrl(provider, testId, aimockPort))

      await clickRun(
        page,
        'transaction-run-banner',
        'transaction-banner-status',
      )

      await expect(page.getByTestId('transaction-banner-result')).toHaveText(
        'BANNER: solo banner',
        { timeout: 15_000 },
      )
    })

    test('composing verb streams two sub-runs and a final result', async ({
      page,
      testId,
      aimockPort,
    }) => {
      await page.goto(transactionUrl(provider, testId, aimockPort))

      await clickRun(
        page,
        'transaction-run-banner-pair',
        'transaction-banner-pair-status',
      )

      // Two `ctx.call(banner, …)` sub-runs, tagged in start order, both
      // reaching success.
      const subRuns = page.locator('[data-testid^="transaction-sub-run-"]')
      await expect(subRuns).toHaveCount(2, { timeout: 15_000 })
      for (const index of [0, 1]) {
        const subRun = page.getByTestId(`transaction-sub-run-${index}`)
        await expect(subRun).toHaveAttribute('data-verb', 'banner')
        await expect(subRun).toHaveAttribute('data-status', 'success', {
          timeout: 15_000,
        })
      }

      // The composing verb's own return value arrives as the final
      // generation:result and lands on `txn.bannerPair.result`.
      await expect(
        page.getByTestId('transaction-banner-pair-result'),
      ).toHaveText('BANNER: hero guitars + BANNER: thumb guitars', {
        timeout: 15_000,
      })
      await expect(
        page.getByTestId('transaction-banner-pair-status'),
      ).toHaveText('success')
    })
  })
}
