import { test, expect } from '../fixtures'
import {
  selectScenario,
  runTest,
  waitForTestComplete,
  getMessages,
} from './helpers'

test.describe('Pending server tool (tools-test page)', () => {
  test('the event poll does not subscribe to a pending tool on every poll', async ({
    page,
    testId,
    aimockPort,
  }) => {
    await selectScenario(page, 'pending-tool-subscriptions', testId, aimockPort)
    await runTest(page)
    await waitForTestComplete(page)

    const messages = await getMessages(page)
    const result = messages
      .flatMap((message) => message.parts)
      .find((part) => part.type === 'tool-result')
    if (result?.type !== 'tool-result' || typeof result.content !== 'string') {
      throw new Error('no string tool result for count_pending_subscriptions')
    }

    // The tool stays pending for 400 ms. A poll every 10 ms that subscribes
    // each time makes about 40 `then` calls on one promise.
    expect(JSON.parse(result.content).mostThenCallsOnOnePromise).toBeLessThan(5)
  })
})
