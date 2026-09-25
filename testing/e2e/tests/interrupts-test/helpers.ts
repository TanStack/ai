import type { Page } from '@playwright/test'

/**
 * Helpers for the /interrupts-test playground. Selectors mirror /tools-test:
 *
 *   #scenario-select        — scenario dropdown
 *   #run-test-button        — starts a run
 *   #approval-section        — tool-approval interrupts container
 *   #generic-section         — generic interrupts container
 *   .approve-button / .deny-button / .cancel-button — per-item controls
 *   #resolve-all-approve / #resolve-all-deny / #cancel-all / #resolve-all-mixed
 *   .resolve-generic-button / .cancel-generic-button
 *   #test-metadata           — hidden div with data-* attributes
 *   #event-log-json          — <script> with the event array
 *   #messages-json-content   — <pre> with full messages JSON
 */

export async function selectScenario(
  page: Page,
  scenario: string,
  testId?: string,
  aimockPort?: number,
): Promise<void> {
  const params = new URLSearchParams()
  if (testId) params.set('testId', testId)
  if (aimockPort) params.set('aimockPort', String(aimockPort))
  params.set('scenario', scenario)
  await page.goto(`/interrupts-test?${params.toString()}`)
  await page.waitForSelector('#run-test-button')
  await page.waitForFunction(
    (expected) =>
      document
        .getElementById('test-metadata')
        ?.getAttribute('data-scenario') === expected,
    scenario,
    { timeout: 10000 },
  )
  // Let React attach delegated handlers before interaction.
  await page.waitForTimeout(300)
}

export async function runTest(page: Page): Promise<void> {
  const readCount = () =>
    page.evaluate(() => {
      const text =
        document.getElementById('messages-json-content')?.textContent || '[]'
      try {
        const parsed = JSON.parse(text)
        return Array.isArray(parsed) ? parsed.length : 0
      } catch {
        return 0
      }
    })

  for (let attempt = 0; attempt < 5; attempt++) {
    const baseline = await readCount()
    await page.click('#run-test-button')
    const started = await page
      .waitForFunction(
        (base) => {
          const meta = document.getElementById('test-metadata')
          if (meta?.getAttribute('data-is-loading') === 'true') return true
          if (
            parseInt(meta?.getAttribute('data-tool-call-count') || '0', 10) > 0
          )
            return true
          if (
            parseInt(meta?.getAttribute('data-interrupt-count') || '0', 10) > 0
          )
            return true
          if (meta?.getAttribute('data-test-complete') === 'true') return true
          const text =
            document.getElementById('messages-json-content')?.textContent ||
            '[]'
          try {
            const parsed = JSON.parse(text)
            return Array.isArray(parsed) && parsed.length > base + 1
          } catch {
            return false
          }
        },
        baseline,
        { timeout: 2000 },
      )
      .then(() => true)
      .catch(() => false)
    if (started) return
  }
  throw new Error('Run test button did not start a chat run')
}

export async function waitForApproval(page: Page, timeout = 10000) {
  await page.waitForSelector('#approval-section', { timeout })
}

/** Wait until exactly `n` tool-approval interrupts are pending. */
export async function waitForPendingApprovals(
  page: Page,
  n: number,
  timeout = 10000,
) {
  await page.waitForFunction(
    (expected) =>
      document
        .getElementById('test-metadata')
        ?.getAttribute('data-pending-approval-count') === String(expected),
    n,
    { timeout },
  )
}

export async function waitForGeneric(page: Page, timeout = 10000) {
  await page.waitForSelector('#generic-section', { timeout })
}

export async function waitForTestComplete(page: Page, timeout = 15000) {
  await page.waitForFunction(
    () => {
      const meta = document.getElementById('test-metadata')
      return (
        meta?.getAttribute('data-test-complete') === 'true' ||
        (meta?.getAttribute('data-is-loading') === 'false' &&
          meta?.getAttribute('data-interrupt-count') === '0')
      )
    },
    undefined,
    { timeout },
  )
  await page.waitForTimeout(200)
}

/** Read every data-* attribute off #test-metadata as a flat string map. */
export async function getMetadata(page: Page): Promise<Record<string, string>> {
  return page.evaluate(() => {
    const el = document.getElementById('test-metadata')
    const out: Record<string, string> = {}
    if (!el) return out
    for (const attr of Array.from(el.attributes)) {
      if (attr.name.startsWith('data-')) {
        // data-approval-granted-count → approvalGrantedCount
        const key = attr.name
          .slice(5)
          .replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())
        out[key] = attr.value
      }
    }
    return out
  })
}

export async function getEventLog(
  page: Page,
): Promise<Array<{ type: string; toolName: string; details?: string }>> {
  return page.evaluate(() => {
    const el = document.getElementById('event-log-json')
    if (!el) return []
    try {
      return JSON.parse(el.textContent || '[]')
    } catch {
      return []
    }
  })
}

export async function getToolCalls(
  page: Page,
): Promise<
  Array<{ id: string; name: string; state: string; output?: unknown }>
> {
  return page.evaluate(() => {
    const el = document.getElementById('tool-calls-json')
    if (!el) return []
    try {
      return JSON.parse(el.textContent || '[]')
    } catch {
      return []
    }
  })
}

/** Collect the ids of every rendered per-item button of a given class. */
async function itemButtonIds(page: Page, cls: string): Promise<Array<string>> {
  return page.evaluate((selector) => {
    return Array.from(document.querySelectorAll(selector))
      .map((el) => el.id)
      .filter(Boolean)
  }, `.${cls}`)
}

/** Click every currently-rendered per-item button of a class, in sequence. */
async function clickAllItems(page: Page, cls: string): Promise<number> {
  const ids = await itemButtonIds(page, cls)
  let clicked = 0
  for (const id of ids) {
    // Use an attribute selector so ids with hyphens (`approve-fc-…`) need no
    // escaping. The list re-renders as items resolve; guard each click.
    const locator = page.locator(`[id="${id}"]`)
    if (await locator.count()) {
      await locator.click()
      clicked++
      await page.waitForTimeout(50)
    }
  }
  return clicked
}

export const approveEachItem = (page: Page) =>
  clickAllItems(page, 'approve-button')
export const denyEachItem = (page: Page) => clickAllItems(page, 'deny-button')
export const cancelEachItem = (page: Page) =>
  clickAllItems(page, 'cancel-button')

export const approveAll = (page: Page) => page.click('#resolve-all-approve')
export const denyAll = (page: Page) => page.click('#resolve-all-deny')
export const cancelAll = (page: Page) => page.click('#cancel-all')
export const resolveAllMixed = (page: Page) => page.click('#resolve-all-mixed')

export const resolveGeneric = (page: Page) =>
  page.click('.resolve-generic-button')
export const cancelGeneric = (page: Page) =>
  page.click('.cancel-generic-button')
