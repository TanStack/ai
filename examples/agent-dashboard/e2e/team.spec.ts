import { expect, test } from '@playwright/test'
import { closeDemo, openDemo } from './devtools'

// The teams reframe: one agent looks like a plain chat; a second member reveals
// the team (roster appears), and both members' AG-UI streams merge into ONE
// channel view. Exercises the product controls: the home agents table's
// "Add to team" and the team page's "＋ Add agent" picker.
test('a second agent reveals the team and both members share one channel', async ({
  page,
}) => {
  await page.goto('/')

  // Start a team from the agents table: support/triage → New team.
  const triageRow = page.getByRole('row').filter({ hasText: 'support/triage' })
  await triageRow.getByRole('button', { name: /Add to team/ }).click()
  await page.getByRole('button', { name: /New team with this agent/ }).click()
  await expect(page).toHaveURL(/\/teams\//)

  // One member: it looks like a normal chat — no team roster.
  await expect(page.getByText(/Members ·/)).toHaveCount(0)

  // Run the first agent from the Demo Controls panel: it looks up the ticket and
  // pauses for approval.
  await openDemo(page)
  await page.getByRole('button', { name: 'Start triage demo' }).click()
  await expect(page.getByText('lookup_ticket').first()).toBeVisible()
  await expect(
    page.getByText('Approval required', { exact: true }).first(),
  ).toBeVisible()

  // Add a second agent from the team page's product control → the roster appears.
  await closeDemo(page)
  await page.getByRole('button', { name: /Add agent/ }).click()
  await page
    .getByRole('button', { name: 'support/triage', exact: true })
    .click()
  await expect(page.getByText('Members · 2')).toBeVisible()

  // Run the second member from the roster; its stream joins the SAME channel.
  await page.getByRole('button', { name: 'Run triage 2' }).click()

  // Both members' runs are visible in one timeline — two lookup_ticket cards and
  // two approvals. If the two threads' row ids collided, we'd see only one each.
  await expect(page.getByText('lookup_ticket')).toHaveCount(2)
  await expect(
    page.getByText('Approval required', { exact: true }),
  ).toHaveCount(2)
})
