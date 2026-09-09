import { expect, test } from '@playwright/test'
import { sendMessage, waitForResponse } from './helpers'

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
})
