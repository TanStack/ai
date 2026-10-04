import { expect, test } from '@playwright/test'
import { closeDemo } from './devtools'

// The meta-chat is the dashboard's own tool-using agent. A quick prompt makes
// it call a tool over live state and summarize the result, with the tool call
// visible inline (dogfooding the trace view).
test('meta-chat calls a tool over live state and summarizes', async ({
  page,
}) => {
  await page.goto('/chat')
  await closeDemo(page)

  await page
    .getByRole('button', { name: 'List the agents on this host' })
    .click()

  // The tool call is visible in the trace…
  await expect(page.getByText('list_agents').first()).toBeVisible()
  // …and the agent summarizes the real result: triage, meta, the two PR-watcher
  // demo agents, and the two Reddit-pod agents are registered on this host.
  await expect(page.getByText(/host runs 6 agent/)).toBeVisible()

  // Its run shows up in history like any other agent.
  await page.getByRole('link', { name: 'History' }).click()
  await expect(page.getByText(/meta-/).first()).toBeVisible()
})
