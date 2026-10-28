import { expect, test } from '@playwright/test'

/**
 * Server-driven generation persistence (`persistence: true`).
 *
 * The counterpart to `generation-persistence.spec.ts` (client-driven). Here the
 * hook keeps NO local store: as a run streams the server records the job, and on
 * mount / after a full `page.reload()` the client restores the last run FROM THE
 * SERVER via a `?threadId=` GET (the `reconstructGeneration` shape) straight into
 * the normal `result` / `status` fields. The restored image renders from the
 * durable serve URL, `localStorage` stays empty, and no run is auto-started.
 *
 * Provider-free: `/api/generation-persistence-server` streams a fixed AG-UI
 * sequence and answers the restore GET from an in-memory job record (exempt from
 * the aimock policy).
 */

test.describe('generation persistence (server-driven)', () => {
  test('records the run server-side and restores it after reload with no local store', async ({
    page,
  }) => {
    await page.goto('/generation-persistence-server')
    await expect(page.getByTestId('hydration-marker')).toBeAttached()
    // Empty first load: the server has no job for this thread yet.
    await expect(page.getByTestId('status')).toHaveText('idle')
    await expect(page.getByTestId('result-id')).toHaveText('none')

    await page.getByTestId('generate-button').click()
    await expect(page.getByTestId('status')).toHaveText('success')
    await expect(page.getByTestId('result-id')).toHaveText('image-1')
    await expect(page.getByTestId('generated-image')).toHaveCount(1)

    // Server-driven mode writes NOTHING to browser storage — the record lives
    // on the server. No localStorage key mentions the generation id.
    const localKeys = await page.evaluate(() =>
      Object.keys(window.localStorage),
    )
    expect(localKeys.some((k) => k.includes('generation-server'))).toBe(false)

    // Reload with empty client storage: the run is restored purely from the
    // server, into the normal fields, and the image comes from the durable URL.
    await page.reload()
    await expect(page.getByTestId('hydration-marker')).toBeAttached()
    await expect(page.getByTestId('status')).toHaveText('success')
    await expect(page.getByTestId('result-id')).toHaveText('image-1')
    await expect(page.getByTestId('generated-image')).toHaveCount(1)
    await expect(page.getByTestId('generated-image')).toHaveAttribute(
      'src',
      '/durable/generation-server/image-1.png',
    )
  })
})
