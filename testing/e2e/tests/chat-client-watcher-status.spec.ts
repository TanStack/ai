import { expect, test } from '@playwright/test'

test('a ChatClient that only watches returns to ready after every run', async ({
  page,
}) => {
  await page.goto('/chat-client-watcher-status')
  const run = page.getByTestId('run')
  await expect(run).toBeEnabled()

  await run.click()
  await expect(page.getByTestId('answers')).toHaveText('1')
  await expect(page.getByTestId('status')).toHaveText('ready')

  await run.click()
  await expect(page.getByTestId('answers')).toHaveText('2')
  await expect(page.getByTestId('status')).toHaveText('ready')
})
