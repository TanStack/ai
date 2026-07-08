import { test, expect } from './fixtures'
import {
  selectScenario,
  runTest,
  waitForTestComplete,
  getEventLog,
} from './tools-test/helpers'

test.describe('Custom Event Emitting', () => {
  test('server tool emits custom events received by client', async ({
    page,
    testId,
    aimockPort,
  }) => {
    await selectScenario(page, 'custom-events', testId, aimockPort)
    await runTest(page)
    await waitForTestComplete(page, 15000, 1)

    const events = await getEventLog(page)
    const customEvents = events.filter((e: any) => e.type === 'custom-event')

    expect(customEvents.length).toBeGreaterThanOrEqual(2)

    const progressEvents = customEvents.filter(
      (e: any) => e.toolName === 'order:progress',
    )
    expect(progressEvents.length).toBe(2)

    const details = progressEvents.map((e: any) => JSON.parse(e.details))
    expect(details[0].step).toBe('validating')
    expect(details[1].step).toBe('processing')
  })
})
