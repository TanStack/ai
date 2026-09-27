import { expect, test } from '@playwright/test'
import { closeDemo, openDemo } from './devtools'
import type { Page } from '@playwright/test'

// Phase 3: the PR-watcher "the pod learns" loop. A webhook opens a per-PR channel,
// a subscribed security agent reviews it, the human corrects it, the correction is
// persisted to pod memory, and the next PR is handled better. These share
// server-side state (the seeded PR sequence, pod memory), so run serially.
test.describe.configure({ mode: 'serial' })

async function newPrWatcherTeam(page: Page) {
  await page.goto('/')
  // The seeded demos live in the Demo Controls devtools panel now.
  await openDemo(page)
  await page.getByRole('button', { name: '+ PR-watcher demo' }).click()
  await expect(page).toHaveURL(/\/teams\//)
  await expect(page.getByText('Members · 2')).toBeVisible()
  await expect(page.getByText('Automations')).toBeVisible()
}

test('the PR-watcher loop: review, correct, remember, handle the next PR better', async ({
  page,
}) => {
  await newPrWatcherTeam(page)

  // 1–2. Webhook in → the watcher opens a per-PR channel and posts a summary.
  await page.getByRole('button', { name: 'Send PR webhook' }).click()
  await expect(page.getByText(/Channel #pr-\d+ created/)).toBeVisible()
  // The new channel shows up in the sidebar; open it.
  const firstChannel = page.getByRole('button', { name: /# pr-\d+/ }).first()
  await expect(firstChannel).toBeVisible()
  const firstChannelName = ((await firstChannel.textContent()) ?? '').trim()
  await firstChannel.click()

  // 3. The watcher's summary and the security agent's finding are both in-channel,
  // and the finding flags the public-internet exposure (no memory yet).
  await expect(page.getByText(/Requesting a security review/)).toBeVisible()
  await expect(page.getByText(/Security finding/)).toBeVisible()
  await expect(page.getByText(/public internet/).first()).toBeVisible()

  // 4. The human corrects it. The agent persists the standing instruction.
  // Close the demo panel so it doesn't cover the message box / Send button.
  await closeDemo(page)
  await page
    .getByPlaceholder('Send a message…')
    .fill("not a security problem — we're intranet-only here")
  await page.getByRole('button', { name: 'Send', exact: true }).click()

  // The write is a visible tool call, and the Memory panel shows the entry.
  await expect(page.getByText('pod.memory_write').first()).toBeVisible()
  await expect(page.getByText('intranet-policy').first()).toBeVisible()

  // 5. The next PR: a second webhook opens a new channel; this time the review is
  // clean and the run carries the "memory attached" badge.
  await page.getByRole('button', { name: /# main/ }).click()
  // Reopen the demo panel to reach the webhook button again.
  await openDemo(page)
  await page.getByRole('button', { name: 'Send PR webhook' }).click()

  // A second, different PR channel appears; open it.
  const secondChannel = page
    .getByRole('button', { name: /# pr-\d+/ })
    .filter({ hasNotText: firstChannelName.replace(/^#\s*/, '') })
  await expect(secondChannel.first()).toBeVisible({ timeout: 15000 })
  await secondChannel.first().click()

  // The pod learned: no intranet finding this time, and memory was attached.
  await expect(page.getByText(/intranet-only per policy/)).toBeVisible()
  await expect(page.getByText(/memory entr(y|ies) attached/)).toBeVisible()
  await expect(page.getByText(/Security finding/)).toHaveCount(0)
})

test('a DM with an agent is created and routes messages to it', async ({
  page,
}) => {
  await newPrWatcherTeam(page)

  // Create a DM with the security member from the roster (a page control, so
  // close the demo panel that would otherwise cover it).
  await closeDemo(page)
  await page.getByRole('button', { name: /New DM with security/ }).click()

  // A dm channel appears in the sidebar; open it.
  const dm = page.getByRole('button', { name: /@ dm-/ })
  await expect(dm).toBeVisible({ timeout: 15000 })
  await dm.click()

  // The DM seats the security agent as its member, so a message reaches it and
  // it replies (regression: DMs used to be created with no members → no reply).
  await page.getByPlaceholder('Send a message…').fill('please review this')
  await page.getByRole('button', { name: 'Send', exact: true }).click()
  await expect(page.getByText(/Security finding/).first()).toBeVisible({
    timeout: 15000,
  })
})

test('the memory panel adds and removes entries', async ({ page }) => {
  await newPrWatcherTeam(page)
  // Memory now lives on the team page (one panel per agent); close the demo
  // overlay and scope to the watcher's panel.
  await closeDemo(page)
  const mem = page.getByRole('group', { name: 'memory pr-watcher' })
  await expect(mem.getByRole('heading', { name: /Memory ·/ })).toBeVisible()
  await mem.getByLabel('memory key').fill('watchlist')
  await mem.getByLabel('memory value').fill('repo:tanstack/ai')
  await mem.getByRole('button', { name: '+ Add entry' }).click()

  await expect(mem.getByText('watchlist')).toBeVisible()
  await expect(mem.getByText('repo:tanstack/ai')).toBeVisible()

  await mem.getByRole('button', { name: 'delete memory watchlist' }).click()
  await expect(mem.getByText('repo:tanstack/ai')).toHaveCount(0)
})
