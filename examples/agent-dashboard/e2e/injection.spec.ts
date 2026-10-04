import { expect, test } from '@playwright/test'
import { closeDemo, openDemo } from './devtools'
import type { Page } from '@playwright/test'

// Phase 2: the dashboard invokes work deterministically — run-now, timers, and
// webhooks — with the structured result streaming into the channel. These share
// server-side state (the scheduler + the offline flag), so run them serially.
test.describe.configure({ mode: 'serial' })

async function newTeam(page: Page) {
  await page.goto('/')
  // The team-creation demos now live in the Demo Controls devtools panel.
  await openDemo(page)
  await page.getByRole('button', { name: '+ New team' }).click()
  await expect(page).toHaveURL(/\/teams\//)
  // The automations panel is present once the channel view mounts.
  await expect(page.getByText('Automations').first()).toBeVisible()
}

test('run-now executes a public tool; private tools are never listed', async ({
  page,
}) => {
  await newTeam(page)

  // Only the public tool (fetch_stats) is offered — the reply tools stay private.
  await expect(
    page.getByRole('button', { name: 'run fetch_stats' }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: /run send_reply/ }),
  ).toHaveCount(0)
  await expect(
    page.getByRole('button', { name: /run lookup_ticket/ }),
  ).toHaveCount(0)

  // Run it now — the result streams back as a structured, injected card.
  await page.getByRole('button', { name: 'run fetch_stats' }).click()
  await expect(page.getByText('manual trigger')).toBeVisible()
  await expect(page.getByText('fetch_stats').first()).toBeVisible()
})

test('a scheduled timer fires a public tool into the channel', async ({
  page,
}) => {
  await newTeam(page)

  // Fire every second so the test doesn't wait on a slow interval.
  await closeDemo(page)
  await page.getByLabel('schedule interval seconds').fill('1')
  await page.getByRole('button', { name: '+ Add schedule' }).click()
  // The timer (dashboard-owned clock) fires within a couple of seconds.
  await expect(page.getByText('timer trigger').first()).toBeVisible({
    timeout: 10000,
  })

  // Pause it so it doesn't keep firing after the test.
  await page.getByRole('button', { name: 'pause' }).first().click()
})

test('a webhook produces the same injected result as the other triggers', async ({
  page,
}) => {
  await newTeam(page)

  await page.getByRole('button', { name: 'Send test webhook' }).click()
  await expect(page.getByText('webhook trigger')).toBeVisible()
})

test('an injected job queues while the host is offline and flushes on reconnect', async ({
  page,
}) => {
  await newTeam(page)

  await page.getByRole('button', { name: 'Simulate host offline' }).click()
  await expect(page.getByText(/host offline/)).toBeVisible()

  // Injecting while offline queues instead of running — no card appears yet.
  await page.getByRole('button', { name: 'run fetch_stats' }).click()
  await expect(page.getByText(/1 queued/)).toBeVisible()
  await expect(page.getByText('manual trigger')).toHaveCount(0)

  // Reconnect → the queue flushes → the result appears.
  await page.getByRole('button', { name: 'Bring host online' }).click()
  await expect(page.getByText('manual trigger')).toBeVisible({ timeout: 8000 })
})
