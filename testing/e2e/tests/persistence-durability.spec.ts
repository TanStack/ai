import { expect, test } from '@playwright/test'
import { sendMessage, waitForResponse } from './helpers'
import type { Page } from '@playwright/test'

/**
 * Client browser-refresh durability (persistence layer).
 *
 * Proves the story wired by `localStoragePersistence` + `useChat({ persistence,
 * id, threadId })`: a single combined `{ messages, resume }` record per chat id
 * survives a full `page.reload()`, so the conversation — and any pending
 * interrupt — is restored from `localStorage` with no server round-trip.
 *
 * Provider-free: the `/api/persistence-durability` harness route streams a fixed
 * AG-UI sequence through a `memoryStream` delivery sink, so there is no LLM in
 * the loop and nothing to mock (exempt from the aimock policy).
 *
 * The mid-stream "rejoin an in-flight run via joinRun after reload" path is NOT
 * covered here: the harness stream completes in a single tick, so there is no
 * deterministic window to reload while a run is still producing. That resume
 * cursor is covered at the transport layer by `delivery-durability.spec.ts` and
 * in `@tanstack/ai-client` unit tests.
 */

async function interruptCount(page: Page): Promise<number> {
  const raw = await page
    .getByTestId('interrupt-count')
    .getAttribute('data-count')
  return raw ? Number(raw) : 0
}

test.describe('persistence durability (browser refresh)', () => {
  test('restores the conversation from the combined localStorage record after reload', async ({
    page,
  }) => {
    await page.goto('/persistence-durability')

    await sendMessage(page, 'tell me about the lighthouse')
    await waitForResponse(page)

    await expect(page.getByTestId('user-message')).toContainText(
      'tell me about the lighthouse',
    )
    await expect(page.getByTestId('assistant-message')).toContainText(
      'PERSIST_OK',
    )

    // The adapter writes ONE combined record (messages + optional resume) under
    // one namespaced key. After a clean finish the resume half is dropped, so
    // the persisted record is messages-only.
    const stored = await page.evaluate(() =>
      window.localStorage.getItem('tanstack-ai:persistence-durability-text'),
    )
    expect(stored).not.toBeNull()
    const record = JSON.parse(stored!) as {
      messages: Array<unknown>
      resume?: unknown
    }
    expect(Array.isArray(record.messages)).toBe(true)
    expect(record.messages.length).toBeGreaterThanOrEqual(2)

    // Full reload: the conversation must come back from localStorage alone.
    await page.reload()

    await expect(page.getByTestId('message-list')).toBeVisible()
    await expect(page.getByTestId('user-message')).toContainText(
      'tell me about the lighthouse',
    )
    await expect(page.getByTestId('assistant-message')).toContainText(
      'PERSIST_OK',
    )
    // No in-flight run to rejoin after a clean finish — the page settles idle.
    await expect(page.getByTestId('loading-indicator')).toHaveCount(0)
  })

  test('keys the persisted record on threadId, not a synthetic per-hook useId', async ({
    page,
  }) => {
    // Regression: `useChat` used to pass its internal `useId()` to ChatClient
    // as `id`, which ChatClient resolves as `persistenceKey = id ?? threadId`.
    // That synthetic id shadowed the developer's `threadId`, so persistence was
    // keyed by an ephemeral per-hook id (e.g. `tanstack-ai:_R_ba_`) instead of
    // the stable `threadId`. Two conversations mounted at the same component
    // position would then collide on one key. The persisted record must live
    // under the `threadId` key alone.
    await page.goto('/persistence-durability')

    await sendMessage(page, 'tell me about the lighthouse')
    await waitForResponse(page)
    await expect(page.getByTestId('assistant-message')).toContainText(
      'PERSIST_OK',
    )

    const tanstackKeys = await page.evaluate(() =>
      Object.keys(window.localStorage).filter((k) =>
        k.startsWith('tanstack-ai:'),
      ),
    )
    // Exactly one namespaced record, keyed by the threadId — no useId-derived key.
    expect(tanstackKeys).toEqual(['tanstack-ai:persistence-durability-text'])
  })

  test('restoring persisted messages on reload does not cause a hydration mismatch', async ({
    page,
  }) => {
    // Restoring the transcript from localStorage must not desync SSR and the
    // first client render: SSR has no localStorage, so if the client reads the
    // persisted messages during the initial synchronous render it produces
    // different HTML than the server sent ("server rendered HTML didn't match
    // the client"). React recovers by regenerating the tree, but the mismatch
    // is a real SSR-correctness defect. Persisted state must hydrate in a way
    // that matches the server's initial (empty) render.
    const hydrationErrors: Array<string> = []
    const capture = (text: string) => {
      if (/hydrat|didn't match|did not match/i.test(text)) {
        hydrationErrors.push(text)
      }
    }
    page.on('console', (m) => {
      if (m.type() === 'error') capture(m.text())
    })
    page.on('pageerror', (e) => capture(e.message))

    await page.goto('/persistence-durability')
    await sendMessage(page, 'tell me about the lighthouse')
    await waitForResponse(page)

    // Reload: the persisted transcript is restored from localStorage.
    await page.reload()
    await expect(page.getByTestId('assistant-message')).toContainText(
      'PERSIST_OK',
    )

    expect(hydrationErrors).toEqual([])
  })

  test('a pending interrupt survives a reload (rehydrated from the resume snapshot)', async ({
    page,
  }) => {
    await page.goto('/persistence-durability?scenario=interrupt')

    await sendMessage(page, 'ship the order')

    // The run ends on a bound generic interrupt; the client folds the pending
    // interrupt into the same combined record.
    await expect
      .poll(() => interruptCount(page), { timeout: 15_000 })
      .toBeGreaterThanOrEqual(1)
    await expect(page.getByTestId('interrupt-confirm-shipment')).toBeVisible()

    // The combined record carries the resume half while the interrupt is pending.
    const stored = await page.evaluate(() =>
      window.localStorage.getItem(
        'tanstack-ai:persistence-durability-interrupt',
      ),
    )
    expect(stored).not.toBeNull()
    const record = JSON.parse(stored!) as { resume?: unknown }
    expect(record.resume).toBeTruthy()

    // Full reload: the interrupt must rehydrate from localStorage, not a refetch.
    await page.reload()

    await expect(page.getByTestId('persistence-durability-page')).toBeVisible()
    await expect
      .poll(() => interruptCount(page), { timeout: 15_000 })
      .toBeGreaterThanOrEqual(1)
    await expect(page.getByTestId('interrupt-confirm-shipment')).toBeVisible()
    await expect(page.getByTestId('interrupt-kind')).toHaveText('generic')
  })
})
