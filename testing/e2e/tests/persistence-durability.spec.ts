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
 * cursor is covered at the transport layer by `delivery-durability.spec.ts`.
 * A client-tool replay that must drain after `joinRun` (issue #1058) is in
 * `join-run-client-tool.spec.ts`.
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
    await expect(page.getByTestId('interrupt-source')).toHaveText('live')

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
    await expect(page.getByTestId('interrupt-source')).toHaveText('hydrate')
  })

  test('restores a pending interrupt from the SERVER on a fresh load (persistence: true)', async ({
    page,
  }) => {
    // Server-authoritative: the client caches nothing. On mount it hydrates from
    // the GET, which returns a pending approval. This is the path that was
    // broken — a fresh client showed the paused tool call with no way to
    // approve/reject. Clear localStorage before the asserting load so the
    // interrupt can ONLY have come from the server.
    await page.goto('/persistence-durability?scenario=server-interrupt')
    await page.evaluate(() => window.localStorage.clear())
    await page.reload()

    await expect(page.getByTestId('persistence-durability-page')).toBeVisible()
    // localStorage is empty, so a visible interrupt proves server-side restore.
    await expect
      .poll(() => interruptCount(page), { timeout: 15_000 })
      .toBeGreaterThanOrEqual(1)
    await expect(page.getByTestId('interrupt-confirm-shipment')).toBeVisible()
    await expect(page.getByTestId('interrupt-kind')).toHaveText('generic')
    await expect(page.getByTestId('interrupt-source')).toHaveText('hydrate')
    // Restored bound and resolvable — the reload can approve/reject, not just
    // view a dead paused tool call.
    await expect(page.getByTestId('interrupt-can-resolve')).toHaveText('true')

    // And the client wrote nothing to localStorage: `persistence: true` keeps no
    // record at all, so the interrupt could only have come from the server.
    const stored = await page.evaluate(() =>
      window.localStorage.getItem(
        'tanstack-ai:persistence-durability-server-interrupt',
      ),
    )
    expect(stored).toBeNull()
  })
})

test.describe('structured output persistence', () => {
  test('restores a completed structured-output part from server persistence', async ({
    request,
  }) => {
    const threadId = `structured-output-${crypto.randomUUID()}`
    const runId = crypto.randomUUID()
    const run = await request.post(
      '/api/persistence-durability?scenario=structured-output',
      { data: { threadId, runId } },
    )
    expect(run.ok()).toBe(true)

    const hydration = await request.get(
      `/api/persistence-durability?scenario=structured-output&threadId=${threadId}`,
    )
    expect(hydration.ok()).toBe(true)
    const body = (await hydration.json()) as {
      messages: Array<{
        role: string
        parts: Array<Record<string, unknown>>
      }>
    }
    const assistants = body.messages.filter(
      (message) => message.role === 'assistant',
    )

    expect(assistants).toHaveLength(2)
    expect(assistants[0]?.parts).toEqual([
      {
        type: 'text',
        content: 'PERSIST_OK the lighthouse still turns.',
      },
    ])
    expect(assistants[1]?.parts).toEqual([
      {
        type: 'structured-output',
        status: 'complete',
        data: { name: 'Ada Lovelace' },
        partial: { name: 'Ada Lovelace' },
        raw: '{"name":"Ada Lovelace"}',
      },
    ])
  })

  test('restores event-sourced harness structured output from server persistence', async ({
    request,
  }) => {
    const threadId = `harness-output-${crypto.randomUUID()}`
    const runId = crypto.randomUUID()
    const run = await request.post(
      '/api/persistence-durability?scenario=harness-output',
      { data: { threadId, runId } },
    )
    expect(run.ok()).toBe(true)

    const hydration = await request.get(
      `/api/persistence-durability?scenario=harness-output&threadId=${threadId}`,
    )
    expect(hydration.ok()).toBe(true)
    const body = (await hydration.json()) as {
      messages: Array<{
        role: string
        parts: Array<Record<string, unknown>>
      }>
    }
    const assistants = body.messages.filter(
      (message) => message.role === 'assistant',
    )

    expect(assistants).toHaveLength(2)
    expect(assistants[0]?.parts).toEqual([
      {
        type: 'text',
        content: 'looking around the repo',
      },
    ])
    expect(assistants[1]?.parts).toEqual([
      {
        type: 'structured-output',
        status: 'complete',
        data: { name: 'Ada Lovelace' },
        partial: { name: 'Ada Lovelace' },
        raw: '{"name":"Ada Lovelace"}',
      },
    ])
  })
})

test.describe('server persistence', () => {
  test('stores cumulative usage across model calls', async ({ request }) => {
    const run = await request.post(
      '/api/persistence-durability?scenario=usage',
      {
        data: {
          threadId: `usage-${crypto.randomUUID()}`,
          runId: crypto.randomUUID(),
        },
      },
    )
    expect(run.ok()).toBe(true)
    const body = (await run.json()) as {
      usage?: {
        promptTokens: number
        completionTokens: number
        totalTokens: number
      }
    }
    expect(body.usage).toEqual({
      promptTokens: 19,
      completionTokens: 6,
      totalTokens: 25,
    })
  })
})
