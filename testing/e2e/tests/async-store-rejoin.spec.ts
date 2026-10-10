import { expect, test } from '@playwright/test'
import { sendMessage } from './helpers'

/**
 * Rejoin a run restored by an async store before `attach()` (issue #1639).
 *
 * With React Native AsyncStorage or IndexedDB the stored record can finish
 * loading before the view mounts. The hydrate then restored the transcript
 * while the client was detached, and `attach()` never rejoined the run, so the
 * partial reply stayed frozen.
 *
 * The page renders the chat inside a hidden `<Activity>` on the second load,
 * so the hydrate resolves first and `attach()` runs only on "Show chat". The
 * harness holds the run until the first page unloads; `REJOIN_OK` arrives
 * after that, so it can only come from `joinRun`.
 *
 * Provider-free: `/api/async-store-rejoin` streams a fixed AG-UI sequence
 * through a `memoryStream` sink (exempt from the aimock policy).
 */

test.describe('async store rejoin (issue #1639)', () => {
  test('rejoins the in-flight run once the view attaches after the store read', async ({
    page,
  }) => {
    const threadId = `async-store-rejoin-${crypto.randomUUID()}`
    await page.goto(
      `/async-store-rejoin?threadId=${encodeURIComponent(threadId)}`,
    )

    await sendMessage(page, 'start')
    await expect(page.getByTestId('assistant-text')).toContainText('PART_ONE')
    await expect(page.getByTestId('assistant-text')).not.toContainText(
      'REJOIN_OK',
    )
    // The run pointer must be in the store before the page goes away.
    await expect
      .poll(() =>
        page.evaluate((key) => {
          const raw = window.localStorage.getItem(key)
          if (!raw) return null
          const record = JSON.parse(raw) as {
            resume?: { resumeState?: { runId?: string } }
          }
          return record.resume?.resumeState?.runId ?? null
        }, `tanstack-ai:${threadId}`),
      )
      .not.toBeNull()

    const joinRequests: Array<string> = []
    page.on('request', (request) => {
      if (
        request.method() === 'GET' &&
        new URL(request.url()).pathname === '/api/async-store-rejoin'
      ) {
        joinRequests.push(request.url())
      }
    })

    // A new document with the chat hidden: the async store read resolves
    // while no view is attached.
    await page.goto(
      `/async-store-rejoin?threadId=${encodeURIComponent(threadId)}&deferAttach=true`,
    )
    await expect(page.locator('html')).toHaveAttribute(
      'data-async-store-read',
      'true',
    )
    // The hydrate must not open a connection while detached.
    expect(joinRequests).toHaveLength(0)

    await page.getByTestId('show-chat').click()

    await expect(page.getByTestId('assistant-text')).toContainText(
      'REJOIN_OK',
      { timeout: 15_000 },
    )
    await expect(page.getByTestId('loading-indicator')).toHaveCount(0)
  })
})
