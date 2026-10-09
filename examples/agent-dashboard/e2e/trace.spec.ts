import { expect, test } from '@playwright/test'
import { answerAgentQuestion, openDemo } from './devtools'

test('shows a live waterfall and resolves an approval from it', async ({
  page,
}) => {
  await page.goto('/')
  await openDemo(page)
  await page.getByRole('button', { name: '+ New team' }).click()
  await page.getByRole('button', { name: 'Start triage demo' }).click()
  await answerAgentQuestion(page)
  await expect(
    page.getByText('Approval required', { exact: true }),
  ).toBeVisible()

  await page.getByRole('button', { name: 'trace', exact: true }).click()
  await expect(page.getByText(/tool · lookup_ticket/)).toBeVisible()
  await expect(page.getByText(/approval ·/)).toBeVisible()
  await page.getByRole('button', { name: 'approve', exact: true }).click()
  await page.getByRole('button', { name: 'timeline', exact: true }).click()
  await expect(page.getByText(/Sent ✅/)).toBeVisible()
})
