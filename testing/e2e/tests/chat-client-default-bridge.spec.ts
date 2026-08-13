import { expect, test } from '@playwright/test'

// The framework hooks always pass the real devtools bridge factory, so this
// is the only scenario in the suite that exercises the no-op bridge that
// vanilla `ChatClient` consumers get by default.
test.describe('vanilla ChatClient with default no-op devtools bridge', () => {
  test('first sendMessage appends the user message and streams a reply', async ({
    page,
  }) => {
    await page.goto('/chat-client-default-bridge')

    await page.getByTestId('send-button').click()

    await expect(page.getByTestId('user-message')).toHaveText(
      'hello from the vanilla client',
    )
    await expect(page.getByTestId('assistant-message')).toContainText(
      'Hi from the assistant',
    )
    await expect(page.getByTestId('send-error')).toHaveCount(0)
  })
})
