import { expect, test } from '@playwright/test'
import { sendMessage, waitForResponse } from './helpers'
import type { APIRequestContext, Page } from '@playwright/test'
import type { UIMessage } from '@tanstack/ai'

/**
 * AG-UI activity is frontend-only (issue #1286). Live ACTIVITY_SNAPSHOT /
 * ACTIVITY_DELTA must show up as `role: 'activity'`, a MESSAGES_SNAPSHOT
 * ActivityMessage must hydrate the same way, and the next send must not put
 * that row back into model input.
 *
 * Provider-free: `/api/activity-test` streams a fixed AG-UI sequence.
 */

test.describe('AG-UI activity', () => {
  test('live snapshot and delta surface a patched activity row', async ({
    page,
  }) => {
    await page.goto('/activity-test')

    await sendMessage(page, '[activity] search')
    await waitForResponse(page)

    const activity = page.getByTestId('activity-message')
    await expect(activity).toHaveCount(1)
    await expect(activity).toHaveAttribute('data-activity-id', 'act-e2e-1')
    await expect(activity).toHaveAttribute('data-activity-type', 'SEARCH')
    await expect(page.getByTestId('activity-content')).toHaveText(
      JSON.stringify({
        query: 'e2e-activity-needle',
        status: 'done',
        hits: 3,
      }),
    )
    await expect(page.getByTestId('assistant-message')).toContainText(
      'ACTIVITY_FOUND',
    )
  })

  test('the next turn does not send activity as model input', async ({
    page,
  }) => {
    await page.goto('/activity-test')

    await sendMessage(page, '[activity] search')
    await waitForResponse(page)
    await expect(page.getByTestId('activity-message')).toHaveCount(1)

    await sendMessage(page, '[activity] again')
    await waitForResponse(page)

    await expect(page.getByTestId('activity-message')).toHaveCount(1)
    await expect(page.getByTestId('assistant-message').last()).toContainText(
      'ACTIVITY_CLEAN',
    )
  })

  test('MESSAGES_SNAPSHOT hydrates an ActivityMessage', async ({ page }) => {
    await page.goto('/activity-test?mode=snapshot')

    await sendMessage(page, '[activity] hydrate')
    await waitForResponse(page)

    const activity = page.getByTestId('activity-message')
    await expect(activity).toHaveCount(1)
    await expect(activity).toHaveAttribute('data-activity-id', 'act-e2e-1')
    await expect(activity).toHaveAttribute('data-activity-type', 'SEARCH')
    await expect(page.getByTestId('activity-content')).toHaveText(
      JSON.stringify({
        query: 'e2e-activity-needle',
        status: 'done',
        hits: 3,
      }),
    )
    await expect(page.getByTestId('assistant-message')).toContainText(
      'ACTIVITY_FOUND',
    )
  })
})

test.describe('AG-UI activity reconstruct', () => {
  test('reconstructChat interleaves stored activity from ActivityStore', async ({
    request,
  }) => {
    const threadId = `activity-${crypto.randomUUID()}`
    const runId = crypto.randomUUID()
    const run = await request.post('/api/activity-test?mode=persist', {
      data: { threadId, runId },
    })
    expect(run.ok()).toBe(true)

    const hydration = await request.get(
      `/api/activity-test?threadId=${threadId}`,
    )
    expect(hydration.ok()).toBe(true)
    const body = (await hydration.json()) as {
      messages: Array<{
        role: string
        parts: Array<Record<string, unknown>>
      }>
    }
    expect(body.messages.map((message) => message.role)).toEqual([
      'user',
      'activity',
      'assistant',
    ])
    expect(body.messages[1]?.parts).toEqual([
      {
        type: 'activity',
        activityType: 'SEARCH',
        content: {
          query: 'e2e-activity-needle',
          status: 'done',
          hits: 3,
        },
      },
    ])
  })

  test('reconstructChat restores activity that middleware added', async ({
    request,
  }) => {
    const threadId = `activity-${crypto.randomUUID()}`
    const run = await request.post(
      '/api/activity-test?mode=persist-middleware',
      { data: { threadId, runId: crypto.randomUUID() } },
    )
    expect(run.ok()).toBe(true)

    const hydration = await request.get(
      `/api/activity-test?threadId=${threadId}`,
    )
    expect(hydration.ok()).toBe(true)
    const body = (await hydration.json()) as {
      messages: Array<{
        role: string
        parts: Array<Record<string, unknown>>
      }>
    }
    expect(body.messages.map((message) => message.role)).toEqual([
      'user',
      'activity',
      'activity',
      'assistant',
    ])
    expect(body.messages[2]?.parts).toEqual([
      {
        type: 'activity',
        activityType: 'NOTICE',
        content: { text: 'from middleware' },
      },
    ])
  })
})

test.describe('AG-UI activity on a failed run', () => {
  test('reconstructChat restores activity from a run that failed', async ({
    request,
  }) => {
    const threadId = `activity-${crypto.randomUUID()}`
    const run = await request.post('/api/activity-test?mode=persist-error', {
      data: { threadId, runId: crypto.randomUUID() },
    })
    expect(run.ok()).toBe(true)

    const hydration = await request.get(
      `/api/activity-test?threadId=${threadId}`,
    )
    expect(hydration.ok()).toBe(true)
    const body = (await hydration.json()) as {
      messages: Array<{ role: string }>
    }
    expect(body.messages.map((message) => message.role)).toEqual([
      'user',
      'activity',
    ])
  })
})

/** The part of the `reconstructChat` body that the reload tests read. */
type SavedThread = {
  activeRun: { runId: string } | null
  messages: Array<UIMessage>
}

/** Opens the page on a new saved thread (`?mode=persist`) and gives its id. */
async function openSavedThread(page: Page) {
  const threadId = `activity-${crypto.randomUUID()}`
  await page.goto(`/activity-test?mode=persist&threadId=${threadId}`)
  return threadId
}

/** Starts a deploy on a new saved thread. The run then waits after step 1. */
async function startDeploy(page: Page) {
  const threadId = await openSavedThread(page)
  await sendMessage(page, '[activity] deploy')
  await expect(page.getByTestId('deploy-progress')).toHaveText('step 1 of 2')
  return threadId
}

/** Lets the waiting `deploy` tool of the thread send step 2 and finish. */
async function finishDeploy(request: APIRequestContext, threadId: string) {
  const finish = await request.post(
    `/api/activity-test?action=finish&threadId=${threadId}`,
  )
  expect(finish.ok()).toBe(true)
}

/**
 * Typed rows that `withPersistence` saves on each change. The page uses
 * `persistence: true`, so a reload loads the rows from the server.
 */
test.describe('AG-UI activity after a reload', () => {
  test('a tool row is still shown after a reload after the run', async ({
    page,
    request,
  }) => {
    const threadId = await startDeploy(page)
    const progress = page.getByTestId('deploy-progress')

    await finishDeploy(request, threadId)
    await waitForResponse(page)
    await expect(progress).toHaveText('step 2 of 2')

    await page.reload()
    await expect(progress).toHaveText('step 2 of 2')
  })

  test('a reload during the run shows the saved row', async ({
    page,
    request,
  }) => {
    const threadId = await startDeploy(page)

    // The reloaded page also replays the run log. So first check that the
    // store has the row while the run waits in the tool.
    const hydration = await request.get(
      `/api/activity-test?threadId=${threadId}`,
    )
    expect(hydration.ok()).toBe(true)
    const body: SavedThread = await hydration.json()
    expect(body.activeRun).not.toBeNull()
    expect(
      body.messages.flatMap((message) =>
        message.role === 'activity' ? message.parts : [],
      ),
    ).toEqual([
      {
        type: 'activity',
        activityType: 'deploy.progress',
        content: { step: 1, total: 2 },
      },
    ])

    const progress = page.getByTestId('deploy-progress')
    await page.reload()
    await expect(progress).toHaveText('step 1 of 2')

    // The reloaded page follows the run to its end.
    await finishDeploy(request, threadId)
    await expect(progress).toHaveText('step 2 of 2')
  })

  test('a sandbox.approval row goes from pending to granted on the next run', async ({
    page,
  }) => {
    await openSavedThread(page)
    const status = page.getByTestId('approval-status')

    await sendMessage(page, '[activity] approval')
    await waitForResponse(page)
    await expect(status).toHaveText('pending')

    // The click sets the row to granted on the client at once. The run after
    // it says APPROVAL_GRANTED only when the server adapter got the decision
    // in `options.approvals`. Without it, the adapter sends the pending row
    // again. Wait for that text: `waitForResponse` can return before a run
    // that a click starts.
    await page.getByTestId('approve-sandbox').click()
    await expect(page.getByTestId('assistant-message').last()).toContainText(
      'APPROVAL_GRANTED',
    )
    await expect(page.getByTestId('loading-indicator')).toBeHidden()
    await expect(status).toHaveText('granted')

    await page.reload()
    await expect(status).toHaveText('granted')
  })
})
