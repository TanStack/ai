import { test, expect } from './fixtures'
import {
  devtoolsUrl,
  openDevtools,
  selectHook,
  waitForDevtoolsHarness,
} from './devtools-helpers'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.clear())
})

test('devtools shows a child agent reasoning, tool call, and reply', async ({
  page,
  testId,
  aimockPort,
}) => {
  await page.goto(devtoolsUrl('/devtools-subagents', testId, aimockPort))
  await waitForDevtoolsHarness(page)
  await page.waitForLoadState('networkidle')
  await expect(async () => {
    await page.getByTestId('run').click()
    await expect(page.getByTestId('message-count')).not.toHaveText('0', {
      timeout: 2_000,
    })
  }).toPass({ timeout: 15_000 })
  await expect(page.getByTestId('card-status-researcher')).toHaveText(
    'finished',
  )

  await openDevtools(page)
  await selectHook(page, 'Blog Desk')

  const parts = page.getByTestId('ai-devtools-preview-part')
  await expect(
    parts.filter({ hasText: 'subagent researcher - finished' }),
  ).toHaveCount(1)
  await expect(
    parts.filter({ hasText: 'researcher > reasoning' }),
  ).toContainText('Look up the facts first.')
  await expect(
    parts.filter({ hasText: 'researcher > tool call lookupFacts' }),
  ).toHaveCount(1)
  await expect(
    parts.filter({ hasText: 'researcher > text' }).last(),
  ).toContainText('Squids have three hearts.')
})
