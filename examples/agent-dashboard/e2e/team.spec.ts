import { expect, test } from '@playwright/test'
import { closeDemo } from './devtools'

// The teams reframe: one agent looks like a plain chat; a second member reveals
// the team (roster appears), and both members' AG-UI streams merge into ONE
// channel view without their run rows colliding.
test('a second agent reveals the team and both members share one channel', async ({
  page,
}) => {
  await page.goto('/')

  // Create a team (one triage agent). Client-side nav keeps the in-memory DB.
  await page.getByRole('button', { name: '+ New team' }).click()
  await expect(page).toHaveURL(/\/teams\//)

  // One member: it looks like a normal chat — no team roster.
  await expect(page.getByText(/Members ·/)).toHaveCount(0)
  await expect(
    page.getByRole('button', { name: 'Start triage demo' }),
  ).toBeVisible()

  // Run the first agent: it looks up the ticket and pauses for approval.
  await page.getByRole('button', { name: 'Start triage demo' }).click()
  await expect(page.getByText('lookup_ticket').first()).toBeVisible()
  await expect(
    page.getByText('Approval required', { exact: true }).first(),
  ).toBeVisible()

  // Add a second agent → the team roster appears.
  await page.getByRole('button', { name: '+ Add agent' }).click()
  await expect(page.getByText('Members · 2')).toBeVisible()

  // Run the second member from the roster; its stream joins the SAME channel.
  // Close the demo panel first so it doesn't cover the roster's run button.
  await closeDemo(page)
  await page.getByRole('button', { name: 'Run triage 2' }).click()

  // Both members' runs are visible in one timeline — two lookup_ticket cards and
  // two approvals. If the two threads' row ids collided, we'd see only one each.
  await expect(page.getByText('lookup_ticket')).toHaveCount(2)
  await expect(
    page.getByText('Approval required', { exact: true }),
  ).toHaveCount(2)
})
