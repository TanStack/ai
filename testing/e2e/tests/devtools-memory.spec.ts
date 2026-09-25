import { test, expect } from './fixtures'
import { sendMessage, waitForResponse } from './helpers'
import {
  devtoolsUrl,
  openDevtools,
  selectDevtoolsTab,
  selectHook,
} from './devtools-helpers'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.clear())
})

test('memory middleware surfaces recall + stored records in the devtools Memory tab', async ({
  page,
  testId,
  aimockPort,
}) => {
  await page.goto(devtoolsUrl('/devtools-memory', testId, aimockPort))

  // Turn 1: the save is deferred until after the turn, so this turn's
  // start-of-turn snapshot is empty — it seeds memory for turn 2.
  await sendMessage(page, '[chat] recommend a guitar')
  await waitForResponse(page)
  await expect(page.getByTestId('assistant-message').first()).toBeVisible()

  // Turn 2: recall runs and the transported snapshot now reflects turn 1's
  // saved user/assistant turn.
  await sendMessage(page, '[chat] recommend a guitar')
  await waitForResponse(page)

  await openDevtools(page)
  await selectHook(page, 'Memory Chat')
  await selectDevtoolsTab(page, 'Memory')

  await expect(page.getByTestId('ai-devtools-memory-panel')).toBeVisible()

  // Operations timeline: at least the recall for turn 2 was re-emitted.
  await expect(
    page.getByTestId('ai-devtools-memory-event').first(),
  ).toBeVisible()

  // Live contents: turn 1's user + assistant messages are stored and shown.
  await expect
    .poll(async () => page.getByTestId('ai-devtools-memory-record').count())
    .toBeGreaterThanOrEqual(2)
})
