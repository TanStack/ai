import { test, expect } from './fixtures'
import type { Page } from '@playwright/test'
import {
  getLastAssistantMessage,
  sendMessage,
  waitForResponse,
} from './helpers'
import { providersFor } from './test-matrix'

// The plugin feature has its own dedicated page (`/plugin`) that drives
// `usePlugin`, which posts to the `/api/plugin` handler — NOT the generic
// matrix page (`/$provider/$feature` → `/api/chat`). So we navigate directly
// rather than via `featureUrl`, exercising the real definePlugin/usePlugin
// path end to end.
function pluginUrl(provider: string, testId: string, aimockPort: number) {
  const params = new URLSearchParams({
    provider,
    testId,
    aimockPort: String(aimockPort),
  })
  return `/plugin?${params.toString()}`
}

/**
 * Click a run button once the page is hydrated. A click that lands before
 * React hydration is a silent no-op, so verify the plugin's status left
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

for (const provider of providersFor('plugin')) {
  test.describe(`${provider} — plugin`, () => {
    test('chat plugin streams through usePlugin + the plugin handler', async ({
      page,
      testId,
      aimockPort,
    }) => {
      await page.goto(pluginUrl(provider, testId, aimockPort))

      await sendMessage(page, '[plugin] recommend a guitar')
      await waitForResponse(page)

      const response = await getLastAssistantMessage(page)
      expect(response).toContain('Fender Stratocaster')
    })

    test('one-shot generation plugin run() renders its result', async ({
      page,
      testId,
      aimockPort,
    }) => {
      await page.goto(pluginUrl(provider, testId, aimockPort))

      await clickRun(page, 'plugin-run-banner', 'plugin-banner-status')

      await expect(page.getByTestId('plugin-banner-result')).toHaveText(
        'BANNER: solo banner',
        { timeout: 15_000 },
      )
    })

    test('media plugin (bannerImage) run() renders its result', async ({
      page,
      testId,
      aimockPort,
    }) => {
      await page.goto(pluginUrl(provider, testId, aimockPort))

      await clickRun(
        page,
        'plugin-run-banner-image',
        'plugin-banner-image-status',
      )

      await expect(page.getByTestId('plugin-banner-image-status')).toHaveText(
        'success',
        { timeout: 15_000 },
      )

      const image = page.getByTestId('plugin-banner-image-result')
      await expect(image).toHaveCount(1)
      await expect(image).toHaveAttribute('src', /.+/)
    })
  })
}
