import { expect, test } from '@playwright/test'

/**
 * Generation resume persistence (browser refresh, client-driven).
 *
 * Proves the transparent restore wired by `localStoragePersistence` +
 * `useGenerateImage({ persistence, id })`: as a run streams, the client writes a
 * lightweight snapshot under `tanstack-ai:generation:<id>` (metadata + the
 * durable artifact URL, never the image bytes). A full `page.reload()` restores
 * it straight into the NORMAL hook fields — `status` is `success`, and `result`
 * is rebuilt so the image renders from the durable serve URL. There is no
 * `resumeSnapshot` field; `reset()` clears everything.
 *
 * Provider-free: `/api/generation-persistence` streams a fixed AG-UI sequence
 * (exempt from the aimock policy).
 */

const STORAGE_KEY = 'tanstack-ai:generation:generation-persistence'

test.describe('generation persistence (browser refresh)', () => {
  test('restores status + result into the normal fields after reload, clears on reset', async ({
    page,
  }) => {
    await page.goto('/generation-persistence')
    await expect(page.getByTestId('hydration-marker')).toBeAttached()
    await expect(page.getByTestId('status')).toHaveText('idle')
    await expect(page.getByTestId('result-id')).toHaveText('none')

    await page.getByTestId('generate-button').click()
    await expect(page.getByTestId('status')).toHaveText('success')
    await expect(page.getByTestId('result-id')).toHaveText('image-1')
    await expect(page.getByTestId('generated-image')).toHaveCount(1)

    // The persisted record holds metadata + the durable artifact URL, never the
    // inline image bytes.
    const stored = await page.evaluate(
      (key) => window.localStorage.getItem(key),
      STORAGE_KEY,
    )
    expect(stored).not.toBeNull()
    expect(stored).toContain('"status":"complete"')
    expect(stored).toContain('/durable/generation-persistence/image-1.png')
    expect(stored).not.toContain('iVBOR')

    // Reload: the run restores transparently into status + result; nothing
    // auto-runs (runId stays null) and the image renders from the durable
    // serve URL, not the inline bytes.
    await page.reload()
    await expect(page.getByTestId('hydration-marker')).toBeAttached()
    await expect(page.getByTestId('status')).toHaveText('success')
    await expect(page.getByTestId('result-id')).toHaveText('image-1')
    await expect(page.getByTestId('run-id')).toHaveText('none')
    await expect(page.getByTestId('generated-image')).toHaveCount(1)
    await expect(page.getByTestId('generated-image')).toHaveAttribute(
      'src',
      '/durable/generation-persistence/image-1.png',
    )

    // Reset clears the in-memory state and deletes the persisted record.
    await page.getByTestId('reset-button').click()
    await expect(page.getByTestId('status')).toHaveText('idle')
    await expect(page.getByTestId('result-id')).toHaveText('none')
    await expect
      .poll(() =>
        page.evaluate((key) => window.localStorage.getItem(key), STORAGE_KEY),
      )
      .toBeNull()

    await page.reload()
    await expect(page.getByTestId('hydration-marker')).toBeAttached()
    await expect(page.getByTestId('status')).toHaveText('idle')
  })
})
