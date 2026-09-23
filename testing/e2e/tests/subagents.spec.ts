import { test, expect } from './fixtures'
import type { Page } from '@playwright/test'

/** Click Run once the page hydrated. A click before hydration does nothing. */
async function run(page: Page) {
  await page.waitForLoadState('networkidle')
  await expect(async () => {
    await page.getByTestId('run').click()
    await expect(page.getByTestId('message-count')).not.toHaveText('0', {
      timeout: 2_000,
    })
  }).toPass({ timeout: 15_000 })
}

function open(
  page: Page,
  scenario: 'route' | 'approval' | 'tool',
  testId: string,
  aimockPort: number,
) {
  return page.goto(
    `/subagents-test?scenario=${scenario}&testId=${encodeURIComponent(testId)}&aimockPort=${aimockPort}`,
  )
}

test.describe('subagents', () => {
  test('a routed child keeps its reasoning, tool call, and reply on its card', async ({
    page,
    testId,
    aimockPort,
  }) => {
    await open(page, 'route', testId, aimockPort)
    await run(page)

    await expect(page.getByTestId('card-status-researcher')).toHaveText(
      'finished',
    )
    const card = page.getByTestId('card-researcher')
    await expect(card).toContainText('thinking:Look up the facts first.')
    await expect(card).toContainText('tool:lookupFacts')
    await expect(card).toContainText('result:')
    await expect(card).toContainText('text:Squids have three hearts.')
    // Nothing from the child lands on the parent message.
    await expect(page.getByTestId('parent-part-types')).toHaveText('subagent')
  })

  test('a child approval pauses the run, then the same child finishes', async ({
    page,
    testId,
    aimockPort,
  }) => {
    await open(page, 'approval', testId, aimockPort)
    await run(page)

    await expect(page.getByTestId('card-status-cleaner')).toHaveText(
      'suspended',
    )
    await expect(page.getByTestId('card-cleaner')).toContainText(
      'tool:deleteLogs:approval-requested',
    )

    await page.getByTestId('approve-deleteLogs').click()

    await expect(page.getByTestId('card-status-cleaner')).toHaveText('finished')
    const card = page.getByTestId('card-cleaner')
    await expect(card).toContainText('result:')
    await expect(card).toContainText('text:Deleted the old logs.')
    await expect(page.getByTestId('approve-deleteLogs')).toHaveCount(0)
    // One card: the resume continued the same child.
    await expect(page.getByTestId('card-cleaner')).toHaveCount(1)
  })

  test('a card overrides the kit widgets for its own parts', async ({
    page,
    testId,
    aimockPort,
  }) => {
    await page.goto(
      `/subagents-ui-test?testId=${encodeURIComponent(testId)}&aimockPort=${aimockPort}`,
    )
    await run(page)

    const card = page.getByTestId('card-researcher')
    await expect(card.getByTestId('root-text')).toHaveText(
      'Squids have three hearts.',
    )
    // The card's own thinking widget, not the root one.
    await expect(card.getByTestId('card-thinking')).toHaveText(
      'Look up the facts first.',
    )
    await expect(card.getByTestId('root-thinking')).toHaveCount(0)
    // No card override for the tool, so the root widget renders it.
    await expect(card.getByTestId('root-tool')).toContainText('lookupFacts:')
  })

  test('without a router the model starts the child and reads its result', async ({
    page,
    testId,
    aimockPort,
  }) => {
    await open(page, 'tool', testId, aimockPort)
    await run(page)

    await expect(page.getByTestId('parent-text')).toHaveText(
      'Research is done.',
    )
    await expect(page.getByTestId('card-status-researcher')).toHaveText(
      'finished',
    )
    await expect(page.getByTestId('card-researcher')).toContainText(
      'text:Squids have three hearts.',
    )
  })
})
