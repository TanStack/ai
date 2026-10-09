import { expect, test } from '@playwright/test'
import { closeDemo } from './devtools'

test('renames and forks a session through the harness protocol', async ({
  page,
}) => {
  const threadId = `tools-${Date.now()}`
  await page.request.post('/api/run', {
    data: { threadId, harness: 'dashboard/meta', message: 'List agents' },
  })
  await page.goto(`/sessions/${threadId}`)
  await closeDemo(page)
  await expect(page.getByText('list_agents').first()).toBeVisible()

  page.once('dialog', (dialog) => dialog.accept('Agent census'))
  await page.getByRole('button', { name: 'Rename' }).click()
  await expect
    .poll(async () => {
      const res = await page.request.get(
        `/api/harness/sessions?threadId=${threadId}`,
      )
      const page1 = await res.json()
      return page1.entries.find(
        (entry: { threadId: string }) => entry.threadId === threadId,
      )?.title
    })
    .toBe('Agent census')

  await page.getByRole('button', { name: 'Fork' }).click()
  await expect(page).not.toHaveURL(new RegExp(`/sessions/${threadId}$`))
  // The fork has the copied transcript.
  await expect(page.getByText('list_agents').first()).toBeVisible()
})

test('picks a model for the next turns', async ({ page }) => {
  const threadId = `model-${Date.now()}`
  const describe = `/api/harness/describe?threadId=${threadId}&harness=sentiment/react`
  // The first open writes the thread's harness into the session index.
  await page.request.get(describe)
  await page.goto(`/sessions/${threadId}`)
  await closeDemo(page)
  await page.getByLabel('model').selectOption('sonnet')
  await expect
    .poll(
      async () => (await (await page.request.get(describe)).json()).settings,
    )
    .toEqual({ model: 'sonnet' })
})
