import { test, expect } from './fixtures'
import { sendMessage, waitForResponse } from './helpers'
import {
  closeDevtools,
  devtoolsUrl,
  expectClassChangesOnHover,
  hookRow,
  openDevtools,
  selectHook,
  waitForDevtoolsHarness,
} from './devtools-helpers'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.clear())
})

test('chat devtools shows user-visible conversation state and clears activity after viewing', async ({
  page,
  testId,
  aimockPort,
}) => {
  await page.goto(devtoolsUrl('/devtools-chat', testId, aimockPort))
  await openDevtools(page)
  await expect(page.getByText(/\d+ new/)).toHaveCount(0)
  await closeDevtools(page)

  await sendMessage(page, '[chat] recommend a guitar')
  await waitForResponse(page)
  await expect(page.getByTestId('assistant-message')).toContainText(
    'Fender Stratocaster',
  )

  await openDevtools(page)
  await expect(hookRow(page, 'Support Chat')).toContainText('new')
  await selectHook(page, 'Support Chat')
  await expect(hookRow(page, 'Support Chat')).not.toContainText('new')
  await expect(page.getByTestId('ai-devtools-hook-tab')).toContainText([
    'Conversation',
    'Tools',
    'State',
  ])
  await expect(
    page.getByTestId('ai-devtools-hook-metric-messages'),
  ).toBeVisible()
  await expect(page.getByTestId('ai-devtools-hook-metric-tokens')).toBeVisible()
  await expect(page.getByTestId('ai-devtools-timeline-message')).toHaveCount(2)
  await expect(page.getByTestId('ai-devtools-preview-message')).toHaveCount(2)
  await expect(
    page.getByTestId('ai-devtools-preview-message').filter({ hasText: 'user' }),
  ).toContainText('[chat] recommend a guitar')
  await expect(
    page
      .getByTestId('ai-devtools-preview-message')
      .filter({ hasText: 'assistant' }),
  ).toContainText('Fender Stratocaster')

  await expectClassChangesOnHover(
    page.getByTestId('ai-devtools-timeline-message').first(),
    page.getByTestId('ai-devtools-preview-message').first(),
  )
  await expectClassChangesOnHover(
    page.getByTestId('ai-devtools-preview-message').last(),
    page.getByTestId('ai-devtools-timeline-message').last(),
  )
})

test('structured useChat renders streaming raw and parsed data without duplicate user-view pane', async ({
  page,
  testId,
  aimockPort,
}) => {
  await page.goto(devtoolsUrl('/devtools-structured', testId, aimockPort))
  await waitForDevtoolsHarness(page)
  await sendMessage(page, '[structured-stream] recommend a guitar as json')
  await waitForResponse(page)
  await expect(page.getByTestId('content-delta-count')).toHaveAttribute(
    'data-count',
    /[1-9]\d*/,
  )
  await expect(page.getByTestId('structured-partial-json')).toContainText(
    'Fender Stratocaster',
  )

  await openDevtools(page)
  await selectHook(page, 'Structured Recommendation')
  await expect(page.getByTestId('ai-devtools-hook-technical-name')).toHaveText(
    'useChat',
  )
  await expect(page.getByTestId('ai-devtools-hook-title')).toHaveText(
    'Structured Recommendation',
  )
  await expect(page.getByTestId('ai-devtools-preview-pane')).toHaveCount(0)
  await expect(
    page
      .getByTestId('ai-devtools-timeline-part')
      .filter({ hasText: 'structured' }),
  ).toContainText('Fender Stratocaster')
})
