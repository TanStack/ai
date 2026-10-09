import { expect, test } from '@playwright/test'

test('Solid useChat keeps history after a reactive body update', async ({
  page,
}) => {
  await page.goto('/solid-reactive-chat')
  await page.getByTestId('send-first').click()
  await expect(page.getByTestId('requests')).toHaveText(
    '[{"users":1,"provider":"openai"}]',
  )

  await page.getByTestId('change-provider').click()
  await page.getByTestId('send-second').click()
  await expect(page.getByTestId('requests')).toHaveText(
    '[{"users":1,"provider":"openai"},{"users":2,"provider":"anthropic"}]',
  )
})
