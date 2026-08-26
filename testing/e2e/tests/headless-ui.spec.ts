import { expect, test } from '@playwright/test'
import { sendMessage } from './helpers'

test('renders typed tools and interrupts once', async ({ page }) => {
  await page.goto('/headless-ui')
  await sendMessage(page, 'Purchase one keyboard')

  await expect(page.getByTestId('purchase-tool')).toHaveCount(1)
  await expect(page.getByTestId('purchase-approval')).toHaveCount(1)
  await expect(page.getByTestId('standalone-tool-result')).toHaveCount(1)

  await page.getByRole('button', { name: 'Approve purchase' }).click()
  await expect(page.getByTestId('purchase-output')).toContainText('approved')
})
