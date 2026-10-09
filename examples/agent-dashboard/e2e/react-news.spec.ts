import { expect, test } from '@playwright/test'
import { closeDemo, openDemo } from './devtools'

// The Reddit pod — the first real-service + real-AI team. A procedural fetcher
// tool pulls React news (served from a recorded fixture under VITE_E2E, so this
// runs offline and deterministically), and a sentiment agent — subscribed to
// the tool's *result* — posts a digest with nobody clicking run on it.
//
// This also exercises the product controls: the demo team is seeded from the
// Demo Controls devtools panel, and the fetch is driven from the roster's
// per-agent "run tool" dialog. It asserts the LOOP structurally (fetch → result
// card → sentiment message), not specific live headlines (see design doc §10).
test('the Reddit pod loop: a news batch triggers an unprompted sentiment digest', async ({
  page,
}) => {
  await page.goto('/')
  // The seeded demos live in the Demo Controls devtools panel now.
  await openDemo(page)
  await page.getByRole('button', { name: '+ React-news demo' }).click()
  await expect(page).toHaveURL(/\/teams\//)

  // Two members: the fetcher and the sentiment agent.
  await expect(page.getByText('Members · 2')).toBeVisible()

  // Close the panel and drive the fetch from the roster's run-tool dialog (the
  // product control): open it on the fetcher, then Run its default tool.
  await closeDemo(page)
  await page.getByRole('button', { name: 'Run a tool on fetcher' }).click()
  await expect(page.getByRole('heading', { name: /Run a tool/ })).toBeVisible()
  await page.getByRole('button', { name: 'Run', exact: true }).click()
  // Dismiss the dialog so it doesn't cover the channel.
  await page.getByRole('button', { name: 'Close' }).click()

  // 1. The batch lands as a result card with (fixtured) real headlines.
  // The result JSON renders as a collapsed tree, so the headline is present in
  // the DOM but not visible until expanded — assert content, not visibility.
  await expect(page.locator('body')).toContainText(
    /React Compiler is now stable/,
    { timeout: 15000 },
  )

  // 2. The sentiment agent posts a digest — unprompted, driven by the
  //    tool_result subscription.
  await expect(page.getByText(/Sentiment digest/).first()).toBeVisible({
    timeout: 15000,
  })
})

// Regression: a team COMPOSED BY HAND (agents table → New team, then ＋ Add
// agent) must react the same as the seeded demo — the sentiment agent carries
// its tool_result subscription by harness default, so nobody has to wire it.
test('a hand-composed Reddit team auto-reacts to a fetch', async ({ page }) => {
  await page.goto('/')
  // Close the demo panel so it doesn't overlay the lower agents-table rows.
  await closeDemo(page)

  // New team from the agents table with reddit/fetcher.
  const fetcherRow = page.getByRole('row').filter({ hasText: 'reddit/fetcher' })
  await fetcherRow.getByRole('button', { name: /Add to team/ }).click()
  await page.getByRole('button', { name: /New team with this agent/ }).click()
  await expect(page).toHaveURL(/\/teams\//)

  // Add the sentiment agent from the team-page product control.
  await page.getByRole('button', { name: /Add agent/ }).click()
  await page
    .getByRole('button', { name: 'sentiment/react', exact: true })
    .click()
  await expect(page.getByText('Members · 2')).toBeVisible()

  // Run the fetch from the roster — the sentiment agent reacts with no manual
  // subscription wiring.
  await page.getByRole('button', { name: 'Run a tool on fetcher' }).click()
  await expect(page.getByRole('heading', { name: /Run a tool/ })).toBeVisible()
  await page.getByRole('button', { name: 'Run', exact: true }).click()
  await page.getByRole('button', { name: 'Close' }).click()

  // The result JSON renders as a collapsed tree, so the headline is present in
  // the DOM but not visible until expanded — assert content, not visibility.
  await expect(page.locator('body')).toContainText(
    /React Compiler is now stable/,
    { timeout: 15000 },
  )
  await expect(page.getByText(/Sentiment digest/).first()).toBeVisible({
    timeout: 15000,
  })
})
