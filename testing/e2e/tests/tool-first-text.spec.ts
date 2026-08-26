import { expect, test } from '@playwright/test'

/**
 * `StreamProcessor` must not drop the first `TEXT_MESSAGE_CONTENT` delta when
 * a tool call's `parentMessageId` precedes that message's real
 * `TEXT_MESSAGE_START` — the normal AG-UI shape for "call a tool, then
 * explain the result" as one assistant turn.
 */
test.describe('tool-first text (#1247)', () => {
  test('does not drop the first text delta after a tool-first message', async ({
    page,
  }) => {
    await page.goto('/tool-first-text')

    await expect(page.getByTestId('assistant-text')).toHaveText('Hello, world.')
  })
})
