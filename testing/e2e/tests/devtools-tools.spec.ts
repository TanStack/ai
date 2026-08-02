import { test, expect } from './fixtures'
import {
  devtoolsUrl,
  openDevtools,
  selectDevtoolsTab,
  selectHook,
} from './devtools-helpers'

test.beforeEach(async ({ page }) => {
  // Reset persisted devtools state on the FIRST page load of each test
  // only, so in-test page.reload() flows can verify localStorage
  // persistence (e.g. saved tool fixtures surviving a refresh).
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('tanstack-ai-e2e:initialized')) {
      localStorage.clear()
      sessionStorage.setItem('tanstack-ai-e2e:initialized', '1')
    }
  })
})

test('tool tab fires, saves, replays, orders, persists, and deletes fixtures', async ({
  page,
  testId,
  aimockPort,
}) => {
  await page.goto(devtoolsUrl('/devtools-tools', testId, aimockPort))
  await openDevtools(page)
  await selectHook(page, 'Tool Runner')
  await selectDevtoolsTab(page, 'Tools')

  const toolRow = page.getByTestId('ai-devtools-tool-row')
  await expect(toolRow).toHaveAttribute('data-tool-name', 'InventoryLookup')
  await expect(toolRow).toContainText('InventoryLookup')

  await page.getByLabel('sku').fill('STRAT-001')
  await page.getByLabel('includeAvailability').selectOption('true')
  await page
    .getByLabel('Output JSON')
    .fill('{"sku":"STRAT-001","name":"Fender Stratocaster","available":true}')
  await page.getByTestId('ai-devtools-tool-fire').click()
  await expect(page.getByTestId('tool-call-InventoryLookup')).toBeVisible()
  await expect(page.getByTestId('tool-call-InventoryLookup')).toContainText(
    'STRAT-001',
  )

  await page.getByTestId('ai-devtools-tool-save').click()
  await page.getByTestId('ai-devtools-fixture-name-input').fill('first lookup')
  await page.getByTestId('ai-devtools-fixture-save-confirm').click()
  await expect(
    page
      .getByTestId('ai-devtools-fixture-row')
      .filter({ hasText: 'first lookup' }),
  ).toBeVisible()

  await page.getByTestId('ai-devtools-tool-save').click()
  await page.getByTestId('ai-devtools-fixture-name-input').fill('second lookup')
  await page.getByTestId('ai-devtools-fixture-save-confirm').click()
  await expect(
    page.getByTestId('ai-devtools-fixture-row').first(),
  ).toHaveAttribute('data-fixture-name', 'second lookup')

  await page.reload()
  await openDevtools(page)
  await selectHook(page, 'Tool Runner')
  await selectDevtoolsTab(page, 'Tools')
  await expect(
    page
      .getByTestId('ai-devtools-fixture-row')
      .filter({ hasText: 'second lookup' }),
  ).toBeVisible()

  await page.getByTestId('ai-devtools-fixture-replay').first().click()
  await expect(page.getByTestId('tool-call-InventoryLookup')).toBeVisible()
  await page.getByTestId('ai-devtools-fixture-delete').first().click()
  await expect(
    page
      .getByTestId('ai-devtools-fixture-row')
      .filter({ hasText: 'second lookup' }),
  ).toHaveCount(0)
})
