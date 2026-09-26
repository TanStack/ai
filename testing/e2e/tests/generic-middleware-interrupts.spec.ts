import type { Page } from '@playwright/test'
import type { PhaseCapture } from '../src/lib/phase-capture'
import { expect, test } from './fixtures'

const genericMode = 'generic-lifecycle'

function middlewareUrl(testId: string, aimockPort: number, scenario: string) {
  const query = new URLSearchParams({
    testId,
    aimockPort: String(aimockPort),
    scenario,
    middlewareMode: genericMode,
  })
  return `/middleware-test?${query}`
}

async function startScenario(
  page: Page,
  testId: string,
  aimockPort: number,
  scenario: string,
) {
  await page.goto(middlewareUrl(testId, aimockPort, scenario))
  await page.waitForSelector('#mw-run-button')
  await page.waitForFunction(
    () =>
      document
        .getElementById('mw-metadata')
        ?.getAttribute('data-is-loading') === 'false',
  )
  // Let React attach delegated handlers before interaction.
  await page.waitForTimeout(300)

  const readCount = () =>
    page.evaluate(() =>
      parseInt(
        document
          .getElementById('mw-metadata')
          ?.getAttribute('data-message-count') || '0',
        10,
      ),
    )

  for (let attempt = 0; attempt < 5; attempt++) {
    const baseline = await readCount()
    await page.locator('#mw-run-button').click()
    const started = await page
      .waitForFunction(
        (base) => {
          const meta = document.getElementById('mw-metadata')
          if (meta?.getAttribute('data-is-loading') === 'true') return true
          if (
            parseInt(meta?.getAttribute('data-interrupt-count') || '0', 10) > 0
          )
            return true
          if (
            parseInt(meta?.getAttribute('data-message-count') || '0', 10) > base
          )
            return true
          return false
        },
        baseline,
        { timeout: 2000 },
      )
      .then(() => true)
      .catch(() => false)
    if (started) {
      await expect(page.getByTestId('generic-review-plan')).toBeVisible()
      return
    }
  }

  throw new Error('Run test button did not start a chat run')
}

async function resolveReview(page: Page) {
  await page.getByTestId('resolve-review-plan').click()
}

async function resolveMixedBatch(page: Page) {
  await resolveReview(page)
  await page.getByTestId('approve-delete-review').click()
}

async function waitForFinished(page: Page) {
  await expect(page.locator('#mw-metadata')).toHaveAttribute(
    'data-interrupt-count',
    '0',
  )
  await expect(page.locator('#mw-metadata')).toHaveAttribute(
    'data-is-loading',
    'false',
  )
}

async function fetchCapture(page: Page, testId: string): Promise<PhaseCapture> {
  const response = await page.request.get(
    `/api/middleware-test?testId=${encodeURIComponent(testId)}&kind=phase`,
  )
  expect(response.ok()).toBe(true)
  return response.json()
}

async function expectAssistantText(page: Page, text: string) {
  await expect(page.locator('#mw-messages-json')).toContainText(text)
}

function expectOneInterruptTerminalForEachBoundary(capture: PhaseCapture) {
  const interruptedRunIds = Array.from(
    new Set(capture.boundaries.map((boundary) => boundary.runId)),
  )

  expect(interruptedRunIds).not.toHaveLength(0)

  for (const runId of interruptedRunIds) {
    const chunks = capture.yieldedChunks.filter(
      (chunk) => chunk.runId === runId,
    )
    const startedIndexes = chunks.flatMap((chunk, index) =>
      chunk.type === 'RUN_STARTED' ? [index] : [],
    )
    const terminalIndexes = chunks.flatMap((chunk, index) =>
      chunk.type === 'RUN_FINISHED' ? [index] : [],
    )

    expect(startedIndexes).toHaveLength(1)
    expect(terminalIndexes).toHaveLength(1)
    const startedIndex = startedIndexes[0]
    const terminalIndex = terminalIndexes[0]
    expect(startedIndex).toBeLessThan(terminalIndex)
    expect(chunks[terminalIndex]?.outcomeType).toBe('interrupt')
    expect(terminalIndex).toBe(chunks.length - 1)
    expect(chunks[terminalIndex - 1]?.type).toBe('MESSAGES_SNAPSHOT')
  }
}

const boundaryCases = [
  {
    scenario: 'generic-before-model',
    boundary: 'beforeModel',
    result: 'BEFORE_MODEL_RESOLVED',
  },
  {
    scenario: 'generic-after-model',
    boundary: 'afterModel',
    result: 'AFTER_MODEL_CONTENT',
  },
  {
    scenario: 'generic-before-tools-continue',
    boundary: 'beforeTools',
    result: 'TOOLS_CONTINUED',
    mixed: true,
  },
  {
    scenario: 'generic-after-tools',
    boundary: 'afterTools',
    result: 'AFTER_TOOLS_RESOLVED',
  },
] as const

for (const boundaryCase of boundaryCases) {
  test(`resolves a typed generic interrupt at ${boundaryCase.boundary}`, async ({
    page,
    testId,
    aimockPort,
  }) => {
    await startScenario(page, testId, aimockPort, boundaryCase.scenario)
    await expect(page.getByTestId('generic-review-plan')).toHaveAttribute(
      'data-definition-id',
      'review-plan',
    )
    await expect(page.getByTestId('generic-review-plan')).toHaveAttribute(
      'data-payload',
      new RegExp(`"boundary":"${boundaryCase.boundary}"`),
    )

    if (boundaryCase.mixed) await resolveMixedBatch(page)
    else await resolveReview(page)
    await waitForFinished(page)
    await expectAssistantText(page, boundaryCase.result)

    const capture = await fetchCapture(page, testId)
    expect(capture.boundaries).toEqual([
      expect.objectContaining({ phase: boundaryCase.boundary }),
    ])
    expect(capture.resolutions).toEqual([
      expect.objectContaining({
        definitionId: 'review-plan',
        status: 'resolved',
        response: {
          approved: true,
          note: 'approved in middleware e2e',
        },
      }),
    ])
  })
}

test('cancels a typed generic interrupt and records the cancellation', async ({
  page,
  testId,
  aimockPort,
}) => {
  await startScenario(page, testId, aimockPort, 'generic-before-model')
  await page.getByTestId('cancel-review-plan').click()
  await waitForFinished(page)

  const capture = await fetchCapture(page, testId)
  expect(capture.resolutions).toEqual([
    expect.objectContaining({
      definitionId: 'review-plan',
      status: 'cancelled',
    }),
  ])
})

test('keeps generic, approval, and client-tool waits in one terminal batch', async ({
  page,
  testId,
  aimockPort,
}) => {
  await startScenario(page, testId, aimockPort, 'generic-before-tools-continue')
  await expect(page.getByTestId('generic-review-plan')).toHaveCount(1)
  await expect(page.getByTestId('delete-review-approval')).toHaveCount(1)
  await expect(page.locator('#mw-metadata')).toHaveAttribute(
    'data-interrupt-count',
    '2',
  )

  await resolveMixedBatch(page)
  await waitForFinished(page)
  await expect(page.locator('#mw-metadata')).toHaveAttribute(
    'data-client-tool-executions',
    '1',
  )

  const capture = await fetchCapture(page, testId)
  const firstTerminal = capture.yieldedChunks.find(
    (chunk) =>
      chunk.type === 'RUN_FINISHED' && chunk.interruptCount !== undefined,
  )
  expect(firstTerminal?.interruptCount).toBe(3)
  expect(capture.toolExecutions).toEqual([
    { name: 'delete_review', side: 'server' },
  ])
  expect(capture.policies).toEqual(['continue'])
})

for (const policyCase of [
  {
    scenario: 'generic-before-tools-cancel',
    policy: 'cancel',
    result: 'TOOLS_CANCELLED',
  },
  {
    scenario: 'generic-before-tools-stop',
    policy: 'stop',
    result: undefined,
  },
] as const) {
  test(`${policyCase.policy} policy prevents pending tool execution`, async ({
    page,
    testId,
    aimockPort,
  }) => {
    await startScenario(page, testId, aimockPort, policyCase.scenario)
    await resolveMixedBatch(page)
    await waitForFinished(page)

    const capture = await fetchCapture(page, testId)
    expect(capture.policies).toEqual([policyCase.policy])
    expect(capture.toolExecutions).toEqual([])
    await expect(page.locator('#mw-metadata')).toHaveAttribute(
      'data-client-tool-executions',
      '0',
    )
    if (policyCase.result) await expectAssistantText(page, policyCase.result)
    else
      await expect(page.locator('#mw-messages-json')).not.toContainText(
        'TOOLS_',
      )
  })
}

for (const scenario of [
  'generic-before-model',
  'generic-after-model',
  'generic-before-tools-continue',
  'generic-before-tools-cancel',
  'generic-before-tools-stop',
  'generic-after-tools',
] as const) {
  test(`emits one final interrupt terminal for ${scenario}`, async ({
    page,
    testId,
    aimockPort,
  }) => {
    await startScenario(page, testId, aimockPort, scenario)
    const capture = await fetchCapture(page, testId)
    expectOneInterruptTerminalForEachBoundary(capture)
  })
}

test('restores a pending generic interrupt after reload and resumes it', async ({
  page,
  testId,
  aimockPort,
}) => {
  await startScenario(page, testId, aimockPort, 'generic-before-model')
  const hydrationErrors: Array<string> = []
  page.on('pageerror', (error) => {
    if (
      /hydration failed|hydrated but|server rendered html/i.test(error.message)
    ) {
      hydrationErrors.push(error.message)
    }
  })
  page.on('console', (message) => {
    const text = message.text()
    if (
      message.type() === 'error' &&
      /hydration failed|hydrated but|server rendered html/i.test(text)
    ) {
      hydrationErrors.push(text)
    }
  })
  await page.reload()
  await expect(page.getByTestId('generic-review-plan')).toBeVisible()
  await resolveReview(page)
  await waitForFinished(page)
  await expectAssistantText(page, 'BEFORE_MODEL_RESOLVED')

  const capture = await fetchCapture(page, testId)
  expect(capture.boundaries).toHaveLength(1)
  expect(capture.resolutions).toEqual([
    expect.objectContaining({ status: 'resolved' }),
  ])
  expect(hydrationErrors).toEqual([])
})
