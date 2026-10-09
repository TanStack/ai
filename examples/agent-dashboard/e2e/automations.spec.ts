import { expect, test } from '@playwright/test'
import { closeDemo, openDemo } from './devtools'

test('manages cron schedules and webhook deliveries from the team page', async ({
  page,
}) => {
  await page.goto('/')
  await openDemo(page)
  await page.getByRole('button', { name: '+ New team' }).click()
  await closeDemo(page)

  await page.getByLabel('schedule cadence').selectOption('cron')
  await page.getByLabel('cron expression').fill('*/30 * * * *')
  await page.getByRole('button', { name: '+ Add schedule' }).click()
  await expect(page.getByText(/upcoming:/)).toContainText('|')
  await page.getByRole('button', { name: 'pause' }).click()
  await expect(page.getByRole('button', { name: 'resume' })).toBeVisible()

  await page.getByRole('button', { name: '+ Add webhook' }).click()
  const endpoint = await page
    .locator('code')
    .filter({ hasText: '/api/webhooks/' })
    .textContent()
  expect(endpoint).toBeTruthy()
  await page.request.post(endpoint!, { data: { queue: 'e2e' } })
  await expect(page.getByText('accepted')).toBeVisible()
  await page.getByRole('button', { name: 'retry' }).click()
  await expect(page.getByText('accepted')).toHaveCount(2)
})
