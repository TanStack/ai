import { expect, test } from '@playwright/test'
import { collectHydrationErrors, sendMessage, waitForResponse } from './helpers'
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

    const hydrationErrors = collectHydrationErrors(page)

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

    const hydrationErrors = collectHydrationErrors(page)

    // Full reload: the interrupt must rehydrate from localStorage, not a refetch.
    await page.reload()

    await expect(page.getByTestId('persistence-durability-page')).toBeVisible()
    await expect
      .poll(() => interruptCount(page), { timeout: 15_000 })
      .toBeGreaterThanOrEqual(1)
    await expect(page.getByTestId('interrupt-confirm-shipment')).toBeVisible()
    await expect(page.getByTestId('interrupt-kind')).toHaveText('generic')
    await expect(page.getByTestId('interrupt-source')).toHaveText('hydrate')
    expect(hydrationErrors).toEqual([])
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

  test('sends one hydrate GET when a chat mounts under React Strict Mode (persistence: true)', async ({
    page,
  }) => {
    // The dev server replays a client mount's effects (attach, detach, attach)
    // before the first GET returns. Each attach used to send its own hydrate
    // GET. The page mounts the chat after hydration, because a hydrated mount
    // gets no replay.
    const hydrateGets: Array<string> = []
    page.on('request', (req) => {
      const url = new URL(req.url())
      if (
        req.method() === 'GET' &&
        url.pathname === '/api/persistence-durability' &&
        url.searchParams.has('threadId')
      ) {
        hydrateGets.push(req.url())
      }
    })

    await page.goto('/client-mount-hydrate')

    // The interrupt comes from the hydrate response, so every hydrate GET of
    // this mount was already sent when it shows.
    await expect
      .poll(() => interruptCount(page), { timeout: 15_000 })
      .toBeGreaterThanOrEqual(1)
    expect(hydrateGets).toHaveLength(1)
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

  test('reconstructChat with includeRuns returns run timings (issue #1061)', async ({
    request,
  }) => {
    const threadId = `run-timings-${crypto.randomUUID()}`
    const run = await request.post(
      '/api/persistence-durability?scenario=usage',
      { data: { threadId, runId: crypto.randomUUID() } },
    )
    expect(run.ok()).toBe(true)
    const { runId } = (await run.json()) as { runId: string }

    const hydrated = await request.get(
      `/api/persistence-durability?scenario=usage&threadId=${encodeURIComponent(threadId)}`,
    )
    expect(hydrated.ok()).toBe(true)
    const body = (await hydrated.json()) as {
      runs?: Array<{
        runId: string
        status: string
        startedAt: number
        finishedAt?: number
      }>
      messages: Array<{
        role: string
        metadata?: {
          tanstack?: {
            run?: { id: string; startedAt?: number; finishedAt?: number }
          }
        }
      }>
    }

    expect(body.runs).toHaveLength(1)
    const [timing] = body.runs!
    expect(timing).toMatchObject({ runId, status: 'completed' })
    expect(timing!.finishedAt).toBeGreaterThanOrEqual(timing!.startedAt)
    const assistant = body.messages.filter((m) => m.role === 'assistant')
    expect(assistant.length).toBeGreaterThan(0)
    for (const message of assistant) {
      expect(message.metadata?.tanstack?.run).toEqual({
        id: runId,
        startedAt: timing!.startedAt,
        finishedAt: timing!.finishedAt,
      })
    }
  })

  test('restores a failed server tool call as failed', async ({ request }) => {
    const threadId = `tool-error-${crypto.randomUUID()}`
    const run = await request.post(
      '/api/persistence-durability?scenario=tool-error',
      { data: { threadId, runId: crypto.randomUUID() } },
    )
    expect(run.ok()).toBe(true)

    const hydration = await request.get(
      `/api/persistence-durability?scenario=tool-error&threadId=${threadId}`,
    )
    expect(hydration.ok()).toBe(true)
    const body = (await hydration.json()) as {
      messages: Array<{ parts: Array<Record<string, unknown>> }>
    }
    const parts = body.messages.flatMap((message) => message.parts)

    expect(parts).toContainEqual(
      expect.objectContaining({
        type: 'tool-result',
        toolCallId: 'call-status',
        state: 'error',
        error: 'Status service unavailable',
      }),
    )
  })

  test('stores only the call metadata on a stopped message', async ({
    request,
  }) => {
    const threadId = `stopped-progress-${crypto.randomUUID()}`
    const run = await request.post(
      '/api/persistence-durability?scenario=stopped-progress',
      { data: { threadId, runId: crypto.randomUUID() } },
    )
    expect(run.ok()).toBe(true)

    const hydration = await request.get(
      `/api/persistence-durability?scenario=stopped-progress&threadId=${encodeURIComponent(threadId)}`,
    )
    expect(hydration.ok()).toBe(true)
    const body = (await hydration.json()) as {
      messages: Array<{
        role: string
        metadata?: { tanstack?: Record<string, unknown> }
      }>
    }
    const assistant = body.messages.find(
      (message) => message.role === 'assistant',
    )

    expect(assistant?.metadata).toEqual({
      tanstack: {
        source: { provider: 'fixed', api: 'text', model: 'test-model' },
        stopReason: 'aborted',
      },
    })
  })

  test('restores the error of a stopped child', async ({ request }) => {
    const threadId = `subagent-stopped-${crypto.randomUUID()}`
    const runId = crypto.randomUUID()
    const seed = await request.post(
      '/api/persistence-durability?scenario=subagent-stopped',
      { data: { threadId, runId } },
    )
    expect(seed.ok()).toBe(true)

    const hydration = await request.get(
      `/api/persistence-durability?scenario=subagent-stopped&threadId=${encodeURIComponent(threadId)}`,
    )
    expect(hydration.ok()).toBe(true)
    const body = (await hydration.json()) as {
      messages: Array<{ parts: Array<Record<string, unknown>> }>
    }
    const parts = body.messages.flatMap((message) => message.parts)

    expect(parts).toContainEqual(
      expect.objectContaining({
        type: 'subagent',
        subagent: expect.objectContaining({
          name: 'researcher',
          status: 'error',
          error: { message: 'Stopped' },
        }),
      }),
    )
  })
})

test.describe('durable interrupt edge cases', () => {
  test('preserves tool-call approval state across reload and executes approved tool once', async ({
    page,
  }) => {
    const threadId = `approval-reload-${crypto.randomUUID()}`
    const approvalId = `approval_call-delete-${threadId}`
    await page.goto(
      `/persistence-durability?scenario=approval-reload&threadId=${encodeURIComponent(threadId)}`,
    )

    await sendMessage(page, 'delete order 77')
    await expect(page.getByTestId(`interrupt-${approvalId}`)).toBeVisible({
      timeout: 15_000,
    })

    // Reload while approval is pending: ToolCallPart keeps approval-requested and approval.id.
    await page.reload()
    await expect(page.getByTestId(`interrupt-${approvalId}`)).toBeVisible({
      timeout: 15_000,
    })
    const toolCall = page.getByTestId('tool-call-delete_order')
    await expect(toolCall).toHaveAttribute('data-state', 'approval-requested')
    await expect(toolCall).toHaveAttribute('data-approval-id', approvalId)

    // Approve and verify single execution.
    await page.getByTestId(`approve-${approvalId}`).click()
    await expect(page.getByTestId('message-list')).toContainText(
      'DELETED_ONCE count=1',
      { timeout: 15_000 },
    )
    await expect.poll(() => interruptCount(page)).toBe(0)

    // Reload after completion: stays approved, never re-prompts.
    await page.reload()
    await expect(page.getByTestId('message-list')).toContainText(
      'DELETED_ONCE count=1',
      { timeout: 15_000 },
    )
    await expect.poll(() => interruptCount(page)).toBe(0)
  })

  test('reload mid-continuation preserves run-1 tool call and never resurrects the approval', async ({
    page,
    request,
  }) => {
    const threadId = `approval-mid-${crypto.randomUUID()}`
    const approvalId = `approval_call-slow-${threadId}`
    await page.goto(
      `/persistence-durability?scenario=approval-mid-continuation&threadId=${encodeURIComponent(threadId)}`,
    )

    await sendMessage(page, 'delete order 55')
    await expect(page.getByTestId(`interrupt-${approvalId}`)).toBeVisible({
      timeout: 15_000,
    })

    // Approve the gated tool and wait until the server tool has started executing.
    await page.getByTestId(`approve-${approvalId}`).click()
    await expect
      .poll(
        async () => {
          const res = await request.get(
            `/api/persistence-durability?scenario=approval-mid-continuation&action=status&threadId=${encodeURIComponent(threadId)}`,
          )
          const json = (await res.json()) as { toolStarted: boolean }
          return json.toolStarted
        },
        { timeout: 15_000 },
      )
      .toBe(true)

    // Reload while the continuation run is still in flight.
    await page.reload()
    await expect(page.getByTestId('loading-indicator')).toBeVisible({
      timeout: 15_000,
    })
    await expect.poll(() => interruptCount(page)).toBe(0)

    // Release the server tool and confirm Run 1's tool call survives joinRun replay.
    const releaseRes = await request.get(
      `/api/persistence-durability?scenario=approval-mid-continuation&action=release&threadId=${encodeURIComponent(threadId)}`,
    )
    expect(releaseRes.ok()).toBe(true)

    await expect(page.getByTestId('message-list')).toContainText(
      'MID_CONT_DONE',
      { timeout: 15_000 },
    )
    await expect(page.getByTestId('tool-call-slow_delete')).toBeVisible()
    await expect.poll(() => interruptCount(page)).toBe(0)
  })

  test('declined approval stays declined after follow-up model error and reload', async ({
    page,
    request,
  }) => {
    const threadId = `decline-fail-${crypto.randomUUID()}`
    const approvalId = `approval_call-charge-${threadId}`
    await page.goto(
      `/persistence-durability?scenario=decline-llm-fail&threadId=${encodeURIComponent(threadId)}`,
    )

    await sendMessage(page, 'charge 99')
    await expect(page.getByTestId(`interrupt-${approvalId}`)).toBeVisible({
      timeout: 15_000,
    })

    // Deny: follow-up model fails with 500.
    await page.getByTestId(`deny-${approvalId}`).click()
    await expect(page.getByTestId('chat-error')).toBeVisible({
      timeout: 15_000,
    })

    // Reload: declined approval must stay resolved and never execute.
    await page.reload()
    await expect(page.getByTestId('persistence-durability-page')).toBeVisible()
    await expect(page.getByTestId('tool-call-charge_card')).toBeVisible({
      timeout: 15_000,
    })
    await expect.poll(() => interruptCount(page)).toBe(0)

    const status = await request.get(
      `/api/persistence-durability?scenario=decline-llm-fail&action=status&threadId=${encodeURIComponent(threadId)}`,
    )
    const { execCount } = (await status.json()) as { execCount: number }
    expect(execCount).toBe(0)
  })

  test('hydrates a pending client-tool interrupt, auto-executes, and keeps chat usable', async ({
    page,
    request,
  }) => {
    const threadId = `client-tool-${crypto.randomUUID()}`
    const seed = await request.post(
      '/api/persistence-durability?scenario=client-tool-reload&seed=1',
      { data: { threadId, runId: `seed-${threadId}` } },
    )
    expect(seed.ok()).toBe(true)

    await page.goto(
      `/persistence-durability?scenario=client-tool-reload&threadId=${encodeURIComponent(threadId)}`,
    )

    // Client hydrates pending client_tool interrupt, runs .client(), and finishes.
    await expect(page.getByTestId('message-list')).toContainText(
      'TZ_RESOLVED UTC',
      { timeout: 15_000 },
    )
    await expect.poll(() => interruptCount(page)).toBe(0)

    // Subsequent messages must work without throwing.
    await sendMessage(page, 'ping')
    await expect(page.getByTestId('message-list')).toContainText('PONG_OK', {
      timeout: 15_000,
    })
  })

  test('switching threads preserves a pending client-persisted interrupt', async ({
    page,
  }) => {
    const threadId = `thread-switch-${crypto.randomUUID()}`
    await page.goto(
      `/persistence-durability?scenario=thread-switch&threadId=${encodeURIComponent(threadId)}`,
    )

    await sendMessage(page, 'ship order')
    await expect(page.getByTestId('interrupt-confirm-shipment')).toBeVisible({
      timeout: 15_000,
    })

    // Switch to thread B, then switch back to thread A.
    await page.getByTestId('switch-thread').click()
    await expect(page.getByTestId('active-thread')).toHaveText(`${threadId}-b`)
    await expect.poll(() => interruptCount(page)).toBe(0)

    await page.getByTestId('switch-thread').click()
    await expect(page.getByTestId('active-thread')).toHaveText(`${threadId}-a`)
    await expect(page.getByTestId('interrupt-confirm-shipment')).toBeVisible({
      timeout: 15_000,
    })
    await expect(page.getByTestId('interrupt-can-resolve')).toHaveText('true')
  })

  test('reconnects after clean socket cut on intermediate RUN_FINISHED(tool_calls)', async ({
    page,
  }) => {
    const threadId = `multi-iter-${crypto.randomUUID()}`
    const approvalId = `approval_call-buy-${threadId}`
    await page.goto(
      `/persistence-durability?scenario=multi-iter-cut&threadId=${encodeURIComponent(threadId)}`,
    )

    await sendMessage(page, 'buy guitar')
    // Iteration 1 closes cleanly on RUN_FINISHED(tool_calls); client reconnects
    // and receives Iteration 2's buy_item approval interrupt.
    await expect(page.getByTestId(`interrupt-${approvalId}`)).toBeVisible({
      timeout: 15_000,
    })
    await expect(page.getByTestId('interrupt-can-resolve')).toHaveText('true')
  })
})
