import { expect, test } from '@playwright/test'
import { closeDemo, openDemo } from './devtools'

test('answers an agent question, steers, and stops a run', async ({ page }) => {
  await page.goto('/')
  await openDemo(page)
  await page.getByRole('button', { name: '+ New team' }).click()
  await page.getByRole('button', { name: 'Start triage demo' }).click()
  await closeDemo(page)

  await expect(page.getByText('Agent question')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Steer' })).toBeVisible()
  await page.getByPlaceholder('Send a message…').fill('Focus on the customer.')
  await page.getByRole('button', { name: 'Steer' }).click()
  await page.getByRole('button', { name: 'Stop' }).click()
  await expect(page.getByRole('button', { name: 'Send' })).toBeVisible()
})
