import { expect, test } from '@playwright/test'

/**
 * `StreamProcessor` must not drop the first `TEXT_MESSAGE_CONTENT` delta when
 * the message's `TEXT_MESSAGE_START` precedes the tool call, the order used by
 * providers that open the assistant message before calling a tool.
 */
test.describe('text-first tool call (#1247)', () => {
  test('does not drop the first text delta when text starts before the tool call', async ({
    page,
  }) => {
    await page.goto('/text-first-tool')

    await expect(page.getByTestId('assistant-text')).toHaveText('Hello, world.')
  })
})
