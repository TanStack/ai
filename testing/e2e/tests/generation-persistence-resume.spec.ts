import { expect, test } from '@playwright/test'

/**
 * Durable generation survives a MID-RUN reload (Fix A + Fix B).
 *
 * The plain `persistence: true` restore (`generation-persistence-server.spec.ts`)
 * only proves a FINISHED run comes back. This proves the harder guarantee: a run
 * still producing when the client disconnects keeps running to its terminal and
 * is tailed to completion by a mount-time `joinRun`.
 *
 * The harness run pauses between `RUN_STARTED` and its result. The spec reloads
 * during that pause, so the live POST response is cancelled while the run is
 * mid-flight. The run can only finish because the durability producer is
 * decoupled from the delivery socket (a disconnect cancels the reader, not the
 * run — Fix B) and `RUN_STARTED` is flushed to the log immediately so the mount
 * `joinRun` finds a cursor to tail (Fix A). Without either, the reload would
 * strand the run on `generating` or settle it to `error`.
 *
 * Provider-free: `/api/generation-persistence-resume` streams a fixed AG-UI
 * sequence through a `memoryStream` sink (exempt from the aimock policy).
 */

const DURABLE_IMAGE_URL = '/durable/generation-resume/image-1.png'

test.describe('generation persistence (durable mid-run reload)', () => {
  test('a run interrupted by a reload is tailed to completion via joinRun', async ({
    page,
  }) => {
    await page.goto('/generation-persistence-resume')
    await expect(page.getByTestId('hydration-marker')).toBeAttached()
    await expect(page.getByTestId('status')).toHaveText('idle')

    await page.getByTestId('generate-button').click()
    // RUN_STARTED reaches the client promptly (flushed to the durable log), so
    // the run is observably in flight — and the result is still pending.
    await expect(page.getByTestId('status')).toHaveText('generating')
    await expect(page.getByTestId('result-id')).toHaveText('none')

    // Reload MID-RUN: the live response is cancelled while the run is producing.
    // Only the surviving durable producer + a mount `joinRun` can finish it.
    await page.reload()
    await expect(page.getByTestId('hydration-marker')).toBeAttached()

    // The rejoin tails the log to the terminal: success, not a stranded
    // `generating` and not an `error`.
    await expect(page.getByTestId('status')).toHaveText('success', {
      timeout: 15_000,
    })
    await expect(page.getByTestId('result-id')).toHaveText('image-1')
    await expect(page.getByTestId('error')).toHaveText('none')
    await expect(page.getByTestId('generated-image')).toHaveCount(1)
    await expect(page.getByTestId('generated-image')).toHaveAttribute(
      'src',
      DURABLE_IMAGE_URL,
    )

    // Server-driven mode keeps no local store — the rejoin came from the server.
    const localKeys = await page.evaluate(() =>
      Object.keys(window.localStorage),
    )
    expect(localKeys.some((k) => k.includes('generation-resume'))).toBe(false)
  })
})
