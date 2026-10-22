import { expect, test } from '@playwright/test'

/**
 * Each model call is its own assistant message. Reasoning that arrives before
 * the call's text id, and a tool-only call, must not land on the previous
 * message. Issue #1533.
 */
test.describe('call ownership (#1533)', () => {
  test('splits three model calls across three assistant messages', async ({
    page,
  }) => {
    await page.goto('/call-ownership')

    await expect(page.getByTestId('assistants')).toHaveText(
      'msg-1 thinking:think A,text:hello,tool-call,tool-result;msg-2 tool-call,tool-result;msg-3 thinking:think B,text:bye',
    )
  })
})
