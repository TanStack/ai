import { test, expect } from '../fixtures'
import {
  getMessages,
  runTest,
  selectScenario,
  waitForTestComplete,
} from './helpers'

/**
 * A server tool returns the string '42'. That string is also JSON text, but
 * the chat must keep it as the string '42', not turn it into the number 42.
 */
test.describe('Server Tool Text Result', () => {
  test('keeps a JSON-text string result as a string', async ({
    page,
    testId,
    aimockPort,
  }) => {
    await selectScenario(page, 'server-tool-text-result', testId, aimockPort)
    await runTest(page)
    await waitForTestComplete(page, 15000, 1)

    const parts = (await getMessages(page)).flatMap((message) => message.parts)
    const call = parts
      .filter((part) => part.type === 'tool-call')
      .find((part) => part.name === 'read_code')
    const result = parts
      .filter((part) => part.type === 'tool-result')
      .find((part) => part.toolCallId === call?.id)

    expect(call).toMatchObject({ state: 'complete', output: '42' })
    expect(result).toMatchObject({ content: '42', state: 'complete' })
  })
})
