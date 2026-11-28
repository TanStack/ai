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

test('a watching client keeps a follow-up separate from assistant reasoning', async ({
  page,
}) => {
  await page.goto('/chat-client-watcher-status')
  await page
    .getByRole('button', { name: 'Receive a follow-up during reasoning' })
    .click()

  const transcript = page.getByTestId('transcript')
  await expect(transcript.locator('[data-role="user"]')).toHaveText(
    'Follow-up.',
  )
  await expect(transcript.locator('[data-role="assistant"]')).toHaveText(
    'Thinking.Answer.',
  )
})
