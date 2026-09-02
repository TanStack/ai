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

test('keeps the Parts subtree mounted while a message streams', async ({
  page,
}) => {
  await page.goto('/headless-ui')
  await sendMessage(page, 'Purchase one keyboard')

  const tool = page.getByTestId('purchase-tool')
  await expect(tool).toHaveCount(1)

  // The run delivers the tool call across several chunks (start, args, end),
  // so this widget re-renders each time. `message` receives one stable `Parts`
  // component, so the subtree survives; a `Parts` rebuilt per render would
  // remount it and push the mount sequence past 1.
  await expect(tool).toHaveAttribute('data-mount-seq', '1')

  await page.getByRole('button', { name: 'Approve purchase' }).click()
  await expect(page.getByTestId('purchase-output')).toContainText('approved')

  // Resuming after the approval streams more chunks into the same message.
  await expect(tool).toHaveAttribute('data-mount-seq', '1')
})
