import { expect, test } from '@playwright/test'
import { sendMessage } from './helpers'

/**
 * joinRun drain after a client-tool replay (issue #1058).
 *
 * The live `streamResponse` path drains queued post-stream actions in
 * `finally`. Rejoin used a different teardown and skipped that drain, so a
 * client-tool result from `joinRun` never went back to the server.
 *
 * This harness holds the first run open until disconnect, like
 * `generation-persistence-resume.spec.ts`. The spec reloads while that run is
 * still producing. On remount the client tails `activeRun` with `joinRun`.
 * `JOIN_OK` is emitted only on the continuation POST that carries the tool
 * result — so a green assertion cannot come from the first stream or from a
 * done-restore.
 *
 * Provider-free: `/api/join-run-client-tool` streams a fixed AG-UI sequence
 * through a `memoryStream` sink (exempt from the aimock policy).
 */

const ALLOW_TOOL_KEY = 'e2e-join-run-client-tool-allow'

test.describe('joinRun client-tool continuation (issue #1058)', () => {
  test('a reload mid client-tool run drains the tool result after joinRun', async ({
    page,
  }) => {
    const threadId = `join-run-client-tool-${crypto.randomUUID()}`
    await page.goto(
      `/join-run-client-tool?threadId=${encodeURIComponent(threadId)}`,
    )
    await expect(page.getByTestId('hydration-marker')).toBeAttached()

    await sendMessage(page, 'look up')
    // Wait until the first POST has a hanging client tool in the log. Reloading
    // on `isLoading` alone can beat the producer, so remount would miss
    // `activeRun` and skip `joinRun`.
    await expect(page.getByTestId('client-tool-pending')).toHaveText('true')
    await expect(page.getByTestId('client-tool-ran')).toHaveText('false')
    await expect(page.getByTestId('assistant-text')).not.toContainText(
      'JOIN_OK',
    )

    await page.reload()
    await expect(page.getByTestId('hydration-marker')).toBeAttached()
    // Unlock the tool only after remount. The execute polls this flag, so a
    // late first-page chunk cannot finish before unload and drain the live path.
    await page.evaluate((key) => {
      sessionStorage.setItem(key, '1')
    }, ALLOW_TOOL_KEY)

    await expect(page.getByTestId('assistant-text')).toContainText('JOIN_OK', {
      timeout: 15_000,
    })
    await expect(page.getByTestId('client-tool-ran')).toHaveText('true')
    await expect(page.getByTestId('loading-indicator')).toHaveCount(0)

    await sendMessage(page, 'later')
    await expect(page.getByTestId('assistant-text')).toContainText('LATER_OK', {
      timeout: 15_000,
    })
  })
})
