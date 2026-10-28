import { expect, test } from '../fixtures'
import type { Page } from '@playwright/test'
import { getMessages, runTest, selectScenario } from './helpers'

/**
 * Regression test for PR #1481.
 *
 * The `canonical-tool-input` scenario streams the wire arguments
 * `{"component":"database","region":null}` and then sends
 * `TOOL_CALL_END.input` without `region`. Before the fix, the client's
 * tool-call part kept the streamed string in `arguments`, and the next user
 * turn sent that string back to the model in its history.
 */
const CANONICAL_ARGUMENTS = '{"component":"database"}'

async function getHistoryTexts(page: Page): Promise<Array<string>> {
  const messages = await getMessages(page)
  return messages
    .flatMap((msg) => msg.parts || [])
    .filter((part) => part.type === 'text')
    .map((part) => part.content as string)
    .filter((content) => content.startsWith('History arguments:'))
}

async function waitForHistoryTexts(page: Page, count: number): Promise<void> {
  await expect
    .poll(async () => (await getHistoryTexts(page)).length, { timeout: 15000 })
    .toBe(count)
}

test.describe('TOOL_CALL_END input after streamed args (tools-test page)', () => {
  test('tool-call part and next request history use the END input', async ({
    page,
    testId,
    aimockPort,
  }) => {
    await selectScenario(page, 'canonical-tool-input', testId, aimockPort)
    await runTest(page)
    await waitForHistoryTexts(page, 1)

    const messages = await getMessages(page)
    const toolCall = messages
      .flatMap((msg) => msg.parts || [])
      .find((part) => part.type === 'tool-call')
    expect(toolCall?.name).toBe('check_status')
    expect(toolCall?.arguments).toBe(CANONICAL_ARGUMENTS)
    expect(toolCall?.input).toEqual({ component: 'database' })

    // The second turn's history is built from the client's tool-call part.
    await runTest(page)
    await waitForHistoryTexts(page, 2)

    const historyTexts = await getHistoryTexts(page)
    expect(historyTexts[1]).toBe(`History arguments: ${CANONICAL_ARGUMENTS}`)
  })
})
