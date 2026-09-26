import { expect, test } from '@playwright/test'

const runInput = (threadId: string) => ({
  data: {
    threadId,
    runId: `${threadId}-r1`,
    messages: [{ id: 'u1', role: 'user', content: 'handle it' }],
    tools: [],
    context: [],
  },
})

test('config form reads and writes ConfigOption schemas', async ({ page }) => {
  await page.goto('/config')
  const tone = page.getByLabel('tone')
  await expect(tone).toBeVisible()
  await tone.selectOption('formal')

  // Written through the harness protocol and persisted.
  await page.waitForTimeout(500)
  const res = await page.request.get('/api/config?threadId=settings')
  const body = await res.json()
  const toneValue = body.options.find((o: { key: string }) => o.key === 'tone')
    .value
  expect(toneValue).toBe('formal')
})

test('spend dashboard shows live token usage after a run', async ({ page }) => {
  const threadId = `spend-${Date.now()}`
  await page.goto(`/sessions/${threadId}`)
  await page.getByRole('button', { name: 'Start triage demo' }).click()
  await expect(page.getByText('Approval required', { exact: true })).toBeVisible()

  // Client-side nav (no reload) so the in-memory TanStack DB projection survives.
  await page.getByRole('link', { name: 'Spend' }).click()
  await expect(page.getByText(/tokens across/)).toBeVisible()
  await expect(page.getByText(threadId).first()).toBeVisible()
})

test('run history lists a run and replays it into the session view', async ({
  page,
}) => {
  const threadId = `replay-${Date.now()}`
  // Run server-side so the browser has no local state for this thread.
  await page.request.post('/api/agent', runInput(threadId))

  await page.goto('/history')
  await expect(page.getByText(threadId).first()).toBeVisible()

  // Open the session fresh — it rehydrates from stored events (replay).
  await page.goto(`/sessions/${threadId}`)
  await expect(page.getByText("I'll pull up that ticket first.")).toBeVisible()
  await expect(page.getByText('lookup_ticket').first()).toBeVisible()
  // The pending approval is restored from the live snapshot.
  await expect(page.getByText('Approval required', { exact: true })).toBeVisible()
})
