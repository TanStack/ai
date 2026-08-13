import { expect, type Locator, type Page } from '@playwright/test'

export function devtoolsUrl(
  route: string,
  testId: string,
  aimockPort: number,
): string {
  return `${route}?testId=${encodeURIComponent(testId)}&aimockPort=${aimockPort}`
}

export async function waitForDevtoolsHarness(page: Page) {
  await expect(page.getByTestId('devtools-hydrated')).toBeAttached()
}

export async function openDevtools(page: Page) {
  await waitForDevtoolsHarness(page)
  await page.getByTestId('open-devtools').click()
  await expect(page.getByTestId('ai-devtools-panel')).toBeVisible()
}

export async function closeDevtools(page: Page) {
  await page.getByTestId('close-devtools').click()
  await expect(page.getByTestId('devtools-panel-host')).toBeHidden()
}

export function hookRows(page: Page): Locator {
  return page.getByTestId('ai-devtools-hook-row')
}

export function hookRow(page: Page, displayName: string): Locator {
  return hookRows(page).filter({ hasText: displayName }).first()
}

export async function selectHook(page: Page, displayName: string) {
  const row = hookRow(page, displayName)
  await expect(row).toBeVisible()
  await row.click()
  await expect(page.getByTestId('ai-devtools-hook-title')).toHaveText(
    displayName,
  )
}

export async function expectHookNames(page: Page, names: Array<string>) {
  await expect(hookRows(page)).toHaveCount(names.length)
  for (const name of names) {
    await expect(hookRow(page, name)).toBeVisible()
  }
}

export async function expectNoHookName(page: Page, name: string) {
  await expect(hookRows(page).filter({ hasText: name })).toHaveCount(0)
}

export async function selectDevtoolsTab(page: Page, tab: string) {
  await page
    .getByTestId('ai-devtools-hook-tab')
    .filter({ hasText: tab })
    .click()
}

export function generationCard(page: Page, hookName: string): Locator {
  return page.locator(
    `[data-testid="generation-hook-card"][data-hook-name="${hookName}"]`,
  )
}

export async function runGenerationHook(page: Page, hookName: string) {
  await waitForDevtoolsHarness(page)
  const card = generationCard(page, hookName)
  await card.getByTestId(`run-${hookName}`).click()
  await expect(card.getByTestId('generation-hook-status')).toHaveText('success')
}

export async function waitForAllGenerationHooks(page: Page, outputCount = 1) {
  const cards = page.getByTestId('generation-hook-card')
  await expect(cards).toHaveCount(6)
  for (let index = 0; index < 6; index++) {
    await expect(
      cards.nth(index).getByTestId('generation-hook-status'),
    ).toHaveText('success')
    await expect
      .poll(async () =>
        Number(
          await cards
            .nth(index)
            .getByTestId('generation-hook-output-count')
            .innerText(),
        ),
      )
      .toBeGreaterThanOrEqual(outputCount)
  }
}

export async function expectClassChangesOnHover(
  hoverSource: Locator,
  highlightedTarget: Locator,
) {
  // Move the cursor outside the hook detail panes so any lingering
  // mouseover from earlier actions (e.g. selectHook clicking a hook row)
  // fires mouseleave and clears the hover-highlight state. Without this
  // the "before" class can already include the highlighted variant.
  await hoverSource.page().mouse.move(0, 0)
  await hoverSource.page().waitForTimeout(50)
  const before = await highlightedTarget.getAttribute('class')
  await hoverSource.hover()
  await expect
    .poll(() => highlightedTarget.getAttribute('class'))
    .not.toBe(before)
}
