import { expect, test } from '@playwright/test'
import { closeDemo } from './devtools'

// The Reddit pod — the first real-service + real-AI team. A procedural fetcher
// tool pulls React news (served from a recorded fixture under VITE_E2E, so this
// runs offline and deterministically), and a sentiment agent — subscribed to
// the tool's *result* — posts a digest with nobody clicking run on it.
//
// This asserts the LOOP structurally: fetch → result card → sentiment message.
// It does NOT assert specific live headlines (live data is non-deterministic;
// see the design doc §10). The sentiment agent runs a deterministic double under
// E2E — a real ANTHROPIC_API_KEY is only needed for a live digest.
test('the Reddit pod loop: a news batch triggers an unprompted sentiment digest', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByRole('button', { name: '+ React-news demo' }).click()
  await expect(page).toHaveURL(/\/teams\//)

  // Two members: the fetcher and the sentiment agent.
  await expect(page.getByText('Members · 2')).toBeVisible()

  // Run the fetcher's public tool from the Demo Controls panel (open by default
  // under E2E). This injects reddit.search_react_news out-of-band — no model turn.
  await page
    .getByRole('button', { name: '▶ run reddit.search_react_news' })
    .click()

  // Close the panel so it doesn't overlay the freshly-appended messages.
  await closeDemo(page)

  // 1. The batch lands as a result card with (fixtured) real headlines.
  await expect(
    page.getByText(/React Compiler is now stable/).first(),
  ).toBeVisible({
    timeout: 15000,
  })

  // 2. The sentiment agent posts a digest — unprompted, driven by the
  //    tool_result subscription.
  await expect(page.getByText(/Sentiment digest/).first()).toBeVisible({
    timeout: 15000,
  })
})
