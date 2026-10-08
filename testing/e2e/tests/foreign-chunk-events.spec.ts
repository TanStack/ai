import { expect, test } from '@playwright/test'

/**
 * An AG-UI producer may send TEXT_MESSAGE_CHUNK, TOOL_CALL_CHUNK and
 * REASONING_MESSAGE_CHUNK in place of the START / CONTENT / END events
 * (issue #1531). useChat must build the same message from them.
 */
test.describe('AG-UI *_CHUNK events from a foreign server', () => {
  test('a turn sent as chunks keeps its reasoning, tool call and text', async ({
    page,
  }) => {
    await page.goto('/foreign-chunk-events?case=turn')

    const message = page.getByTestId('message-msg-chunked')
    await expect(message.getByTestId('text')).toHaveText('It is sunny in Kyiv.')
    await expect(message.getByTestId('thinking')).toHaveText(
      'Look up the weather.',
    )
    await expect(message.getByTestId('tool-call-get_weather')).toHaveText(
      '{"city":"Kyiv"} -> "sunny"',
    )
    await expect(page.getByTestId('assistant-ids')).toHaveText('msg-chunked')
  })

  test('a chunk before RUN_ERROR keeps its text, id and metadata', async ({
    page,
  }) => {
    await page.goto('/foreign-chunk-events?case=error')

    const message = page.getByTestId('message-msg-error')
    await expect(message.getByTestId('text')).toHaveText('the run failed')
    await expect(message.getByTestId('metadata')).toHaveText(
      '{"error":"upstream timeout"}',
    )
  })
})
