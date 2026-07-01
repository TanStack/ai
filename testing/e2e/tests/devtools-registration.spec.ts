import { test, expect } from './fixtures'
import {
  devtoolsUrl,
  expectHookNames,
  expectNoHookName,
  hookRow,
  openDevtools,
  selectHook,
  waitForDevtoolsHarness,
} from './devtools-helpers'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.clear())
})

test('discovers already-mounted hooks and starts on dashboard after refresh', async ({
  page,
  testId,
  aimockPort,
}) => {
  await page.goto(devtoolsUrl('/devtools-chat', testId, aimockPort))
  await expect(page.getByTestId('support-chat-status')).toHaveText('ready')

  await openDevtools(page)
  await expectHookNames(page, ['Support Chat'])
  await selectHook(page, 'Support Chat')
  await expect(page.getByTestId('ai-devtools-hook-technical-name')).toHaveText(
    'useChat',
  )

  await page.reload()
  await openDevtools(page)
  await expect(page.getByTestId('ai-devtools-dashboard-overview')).toBeVisible()
  await expectHookNames(page, ['Support Chat'])
})

test('registers hooks mounted before devtools is opened', async ({
  page,
  testId,
  aimockPort,
}) => {
  await page.goto(devtoolsUrl('/devtools-chat', testId, aimockPort))
  await waitForDevtoolsHarness(page)
  await page.getByTestId('mount-secondary-chat').click()
  await expect(page.getByTestId('secondary-chat-mounted')).toBeVisible()

  await openDevtools(page)
  await expectHookNames(page, ['Support Chat', 'Secondary Chat'])
})

test('route changes remove stale hooks and avoid duplicates', async ({
  page,
  testId,
  aimockPort,
}) => {
  await page.goto(devtoolsUrl('/devtools-route-a', testId, aimockPort))
  await openDevtools(page)
  await expectHookNames(page, ['Route A Chat', 'Route A Aux'])

  await page.getByTestId('route-b-link').click()
  await expect(page.getByTestId('route-name')).toHaveText('Route B')
  await openDevtools(page)
  await expectHookNames(page, ['Route B Chat'])
  await expectNoHookName(page, 'Route A Chat')
  await expectNoHookName(page, 'Route A Aux')
})

test('sidebar groups generation hooks by user-visible category without initial new badges', async ({
  page,
  testId,
  aimockPort,
}) => {
  await page.goto(devtoolsUrl('/devtools-generation-hooks', testId, aimockPort))
  await openDevtools(page)
  await expectHookNames(page, [
    'Image Studio',
    'Audio Studio',
    'Speech Studio',
    'Transcription Studio',
    'Summary Studio',
    'Video Studio',
  ])

  for (const category of [
    'image',
    'audio',
    'speech',
    'transcription',
    'summarize',
    'video',
  ]) {
    await expect(
      page.locator(
        `[data-testid="ai-devtools-hook-category"][data-category="${category}"]`,
      ),
    ).toBeVisible()
  }

  await expect(page.getByText(/\d+ new/)).toHaveCount(0)
  await expect(hookRow(page, 'Image Studio')).toHaveAttribute(
    'data-hook-name',
    'useGenerateImage',
  )
})
