import { test, expect } from './fixtures'
import {
  devtoolsUrl,
  generationCard,
  openDevtools,
  selectHook,
  waitForDevtoolsHarness,
} from './devtools-helpers'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.clear())
})

test('narrow viewport keeps generation tabs, run cards, output pane, and modal usable', async ({
  page,
  testId,
  aimockPort,
}) => {
  await page.setViewportSize({ width: 390, height: 820 })
  await page.goto(devtoolsUrl('/devtools-generation-hooks', testId, aimockPort))
  await waitForDevtoolsHarness(page)
  await page.getByTestId('run-useGenerateImage').click()
  await expect(
    generationCard(page, 'useGenerateImage').getByTestId(
      'generation-hook-status',
    ),
  ).toHaveText('success')

  await openDevtools(page)
  await selectHook(page, 'Image Studio')
  await expect(page.getByTestId('ai-devtools-hook-tab')).toHaveText([
    'Generation',
    'State',
  ])
  await expect(page.getByTestId('ai-devtools-generation-run')).toBeVisible()
  await expect(page.getByTestId('ai-devtools-preview-pane')).toBeVisible()
  await expect(page.getByTestId('ai-devtools-generation-output')).toHaveCount(2)

  await page.getByTestId('ai-devtools-generation-output').first().click()
  await expect(page.getByTestId('ai-devtools-output-modal')).toBeVisible()
  const modalBox = await page
    .getByTestId('ai-devtools-output-modal')
    .boundingBox()
  expect(modalBox?.width).toBeLessThanOrEqual(390)
  expect(modalBox?.height).toBeLessThanOrEqual(820)
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('ai-devtools-output-modal')).toHaveCount(0)
})
