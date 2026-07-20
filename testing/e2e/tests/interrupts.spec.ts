import { expect, test } from '@playwright/test'
import type { APIRequestContext, Page } from '@playwright/test'

function fixtureId(label: string): string {
  const info = test.info()
  return `${label}-${info.workerIndex}-${info.testId}`
}

function interruptUrl(testId: string, scenario: string): string {
  const search = new URLSearchParams({ testId, scenario })
  return `/interrupts-v2?${search.toString()}`
}

async function startScenario(
  page: Page,
  testId: string,
  scenario: string,
): Promise<void> {
  await page.goto(interruptUrl(testId, scenario))
  await page.getByTestId('start-run').click()
}

async function readStats(request: APIRequestContext, testId: string) {
  const response = await request.get(
    `/api/interrupts-v2?testId=${encodeURIComponent(testId)}&stats=1`,
  )
  expect(response.ok()).toBe(true)
  return response.json()
}

test('submits a singleton approval unchanged or with an edited input', async ({
  page,
}) => {
  const unchangedId = fixtureId('interrupt-singleton-unchanged')
  await startScenario(page, unchangedId, 'singleton-approval')
  await expect(page.getByTestId('interrupt-card')).toHaveCount(1)
  await page.getByRole('button', { name: 'Approve', exact: true }).click()
  await expect(page.getByTestId('continuation-count')).toHaveText('1')
  await expect(page.getByTestId('submitted-decisions')).toHaveText('approve')
  await expect(page.getByTestId('submitted-edits')).toHaveText('{}')

  const editedId = fixtureId('interrupt-singleton-edited')
  await startScenario(page, editedId, 'singleton-approval')
  await expect(page.getByTestId('interrupt-card')).toHaveCount(1)
  await page.getByTestId('edited-action').fill('edited-action')
  await page.getByRole('button', { name: 'Approve edited' }).click()
  await expect(page.getByTestId('continuation-count')).toHaveText('1')
  await expect(page.getByTestId('submitted-edits')).toHaveText(
    '{"action":"edited-action"}',
  )
})

test('waits for all three cards before one atomic submission', async ({
  page,
}) => {
  const testId = fixtureId('interrupts-v2-batch')
  await startScenario(page, testId, 'three-tool-approvals')
  await expect(page.getByTestId('interrupt-card')).toHaveCount(3)

  await page
    .getByTestId('interrupt-card')
    .nth(0)
    .getByRole('button', { name: 'Approve' })
    .click()
  await expect(page.getByTestId('continuation-count')).toHaveText('0')
  await page
    .getByTestId('interrupt-card')
    .nth(1)
    .getByRole('button', { name: 'Deny' })
    .click()
  await expect(page.getByTestId('continuation-count')).toHaveText('0')
  await page
    .getByTestId('interrupt-card')
    .nth(2)
    .getByRole('button', { name: 'Cancel' })
    .click()

  await expect(page.getByTestId('continuation-count')).toHaveText('1')
  await expect(page.getByTestId('submitted-decisions')).toHaveText(
    'approve,deny,cancel',
  )
})

test('root callback performs synchronous side effects and returns undefined', async ({
  page,
}) => {
  const testId = fixtureId('interrupt-callback')
  await startScenario(page, testId, 'heterogeneous-callback')
  await expect(page.getByTestId('interrupt-card')).toHaveCount(3)
  await page.getByTestId('resolve-callback').click()
  await expect(page.getByTestId('callback-return-values')).toHaveText(
    'undefined,undefined,undefined',
  )
  await expect(page.getByTestId('continuation-count')).toHaveText('1')
  await expect(page.getByTestId('submitted-decisions')).toHaveText(
    'approve,deny,generic',
  )
})

test('records approve, deny, and cancel decisions in audit and result history', async ({
  page,
}) => {
  const testId = fixtureId('interrupt-audit')
  await startScenario(page, testId, 'three-tool-approvals')
  await expect(page.getByTestId('interrupt-card')).toHaveCount(3)
  await page.getByTestId('approve-first').click()
  await page.getByTestId('deny-second').click()
  await page.getByTestId('cancel-third').click()

  await expect(page.getByTestId('audit-history')).toHaveText(
    'approval-1:approve|approval-2:deny|approval-3:cancel',
  )
  await expect(page.getByTestId('result-event-names')).toHaveText(
    'TOOL_CALL_RESULT,TOOL_CALL_RESULT,RUN_STARTED,RUN_FINISHED',
  )
  await expect(page.getByTestId('stored-history')).toContainText(
    'approve,deny,cancel',
  )
})

test('keeps a generic interrupt staged until its payload validates', async ({
  page,
}) => {
  const testId = fixtureId('interrupt-generic')
  await startScenario(page, testId, 'generic-validation')
  await expect(page.getByTestId('interrupt-kind-generic')).toHaveCount(1)
  await page.getByTestId('generic-draft').fill('{"answer":1}')
  await page.getByTestId('resolve-generic').click()
  await expect(page.getByTestId('interrupt-error-generic')).toContainText(
    'invalid-payload',
  )
  await expect(page.getByTestId('continuation-count')).toHaveText('0')

  await page.getByTestId('generic-draft').fill('{"answer":"correct"}')
  await page.getByTestId('resolve-generic').click()
  await expect(page.getByTestId('interrupt-error-generic')).toHaveText('')
  await expect(page.getByTestId('continuation-count')).toHaveText('1')
})

test('shows every item error and the root aggregate in one response', async ({
  page,
}) => {
  const testId = fixtureId('interrupt-errors')
  await startScenario(page, testId, 'two-invalid')
  await page.getByTestId('invalid-first').click()
  await page.getByTestId('invalid-second').click()
  await expect(page.getByTestId('interrupt-error-first')).toContainText(
    'invalid-edited-args',
  )
  await expect(page.getByTestId('interrupt-error-second')).toContainText(
    'invalid-payload',
  )
  await expect(page.getByTestId('interrupt-errors-root')).toContainText(
    'item-validation-failed',
  )
  await expect(page.getByTestId('interrupt-errors-root')).toContainText(
    'approval-1,question-1',
  )
  await page.getByTestId('correct-first').click()
  await expect(page.getByTestId('interrupt-error-first')).toHaveText('')
  await expect(page.getByTestId('interrupt-error-second')).toContainText(
    'invalid-payload',
  )
  await page.getByTestId('correct-second').click()
  await expect(page.getByTestId('continuation-count')).toHaveText('1')
})

test('auto-executes the client tool internally and keeps it out of the public interrupts', async ({
  page,
}) => {
  const testId = fixtureId('interrupt-client-tool')
  await startScenario(page, testId, 'client-tool-and-approval')
  // The client tool has a `.client()` implementation, so it executes
  // automatically and never appears as a public interrupt â€” only the approval
  // is surfaced.
  await expect(
    page.getByTestId('interrupt-kind-client-tool-execution'),
  ).toHaveCount(0)
  await expect(page.getByTestId('interrupt-kind-tool-approval')).toHaveCount(1)
  // Resolving the public approval completes the batch (the client tool has
  // already auto-resolved internally) and the run continues.
  await page.getByTestId('approve-server-tool').click()
  await expect(page.getByTestId('continuation-count')).toHaveText('1')
  await expect(page.getByTestId('submitted-decisions')).toContainText(
    'client-tool',
  )
})

test('schedules a mixed core batch and resumes only after every item resolves', async ({
  page,
}) => {
  const testId = fixtureId('interrupt-core-mixed')
  await startScenario(page, testId, 'core-mixed-client-approval')
  // Only the approval is public; the client tool auto-executes internally.
  await expect(page.getByTestId('interrupt-card')).toHaveCount(1)
  await expect(
    page.getByTestId('interrupt-kind-client-tool-execution'),
  ).toHaveCount(0)
  await expect(page.getByTestId('interrupt-kind-tool-approval')).toHaveCount(1)

  // The batch resumes only after the public approval resolves; the client tool
  // has already auto-resolved internally.
  await expect(page.getByTestId('continuation-count')).toHaveText('0')
  await page.getByTestId('approve-server-tool').click()
  await expect(page.getByTestId('continuation-count')).toHaveText('1')
  await expect(page.getByTestId('submitted-decisions')).toHaveText(
    'approve,client-tool',
  )
  await expect(page.getByTestId('result-event-names')).toHaveText(
    'TOOL_CALL_RESULT,TOOL_CALL_RESULT,RUN_STARTED,RUN_FINISHED',
  )
})

test('ignores a foreign structured resume error and applies the correlated local failure', async ({
  page,
}) => {
  const testId = fixtureId('interrupt-shared-error')
  await startScenario(page, testId, 'shared-error-correlation')
  await expect(page.getByTestId('interrupt-kind-generic')).toHaveCount(1)
  await page.getByTestId('generic-draft').fill('{"answer":"ready"}')
  await page.getByTestId('resolve-generic').click()
  await expect(page.getByTestId('resume-status')).toHaveText('resuming')

  await page.getByTestId('publish-foreign-error').click()
  await expect(page.getByTestId('retry-banner')).toBeVisible()
  await expect(page.getByTestId('interrupt-errors-items')).toHaveText('')
  await expect(page.getByTestId('interrupt-errors-root')).toContainText(
    'transport',
  )
  await expect(page.getByTestId('interrupt-errors-root')).not.toContainText(
    'foreign',
  )

  await page.getByTestId('retry-interrupts').click()
  await expect(page.getByTestId('resume-status')).toHaveText('resuming')
  await page.getByTestId('publish-local-error').click()
  await expect(page.getByTestId('interrupt-errors-items')).toContainText(
    'local item error',
  )
  await expect(page.getByTestId('interrupt-errors-root')).toContainText(
    'local batch error',
  )
  await expect(page.getByTestId('interrupt-errors-root')).not.toContainText(
    'foreign',
  )
})
