import { expect, test } from '@playwright/test'

// Server-side persistence: a team, its runs, and its resolved approvals survive a
// full page reload (the roster rehydrates from the server; the session replays
// from stored events). Regression guard for two bugs:
//   1. the team vanished on reload (roster was client-only), and
//   2. an already-approved tool call resurfaced as "Approval required" because the
//      tail replayed the historical interrupt as if it were live.
test('a team and its approved run survive a reload', async ({ page }) => {
  await page.goto('/')

  // Create a triage team and run it to the approval.
  await page.getByRole('button', { name: '+ New team' }).click()
  await expect(page).toHaveURL(/\/teams\//)
  await page.getByRole('button', { name: 'Start triage demo' }).click()
  await expect(
    page.getByText('Approval required', { exact: true }).first(),
  ).toBeVisible()

  // Approve via the AG-UI resume flow; the run continues and finishes.
  await page.getByRole('button', { name: 'Approve', exact: true }).click()
  await expect(page.getByText(/Sent ✅/)).toBeVisible()
  await expect(page.getByText('Approval required', { exact: true })).toHaveCount(0)

  // Reload: the team must reappear (roster is persisted) and the finished run must
  // replay — WITHOUT the resolved approval coming back.
  await page.reload()
  await expect(page.getByText(/Sent ✅/)).toBeVisible()
  await expect(page.getByText('Approval required', { exact: true })).toHaveCount(0)
})
