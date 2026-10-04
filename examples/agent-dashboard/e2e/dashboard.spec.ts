import { expect, test } from '@playwright/test'
import { answerAgentQuestion, closeDemo } from './devtools'

// The dashboard embeds a deterministic support-triage agent, so this runs with
// no API key: send a prompt, watch the AG-UI stream, approve a tool call
// mid-run, and see the run resume — the north-star approval demo.
test('streams a session and approves a tool call mid-run', async ({ page }) => {
  const threadId = `e2e-${Date.now()}`
  await page.goto(`/sessions/${threadId}`)
  await closeDemo(page)

  const startButton = page.getByRole('button', { name: 'Start triage demo' })
  await expect(startButton).toBeVisible()
  await startButton.click()
  await answerAgentQuestion(page)

  // The agent looks up the ticket (auto tool) then drafts a reply for approval.
  await expect(page.getByText('lookup_ticket').first()).toBeVisible()
  await expect(
    page.getByText("Here's a draft reply for your approval."),
  ).toBeVisible()

  // The approval card appears (the run paused on the interrupt).
  await expect(
    page.getByText('Approval required', { exact: true }),
  ).toBeVisible()
  await expect(page.getByText('send_reply').first()).toBeVisible()

  // Spend meter is live (tokens accrued from the stream).
  await expect(page.getByText(/[1-9][0-9,]* tokens/)).toBeVisible()

  // Approve via the AG-UI resume flow; the run continues and finishes.
  await page.getByRole('button', { name: 'Approve', exact: true }).click()

  await expect(page.getByText(/Sent ✅/)).toBeVisible()
  await expect(
    page.getByText('Approval required', { exact: true }),
  ).toHaveCount(0)
})
