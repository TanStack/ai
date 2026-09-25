import { expect, test } from '@playwright/test'

/**
 * An AG-UI `Interrupt` is a shared envelope — a workflow engine or another
 * agent framework can put one on the same stream. Only interrupts carrying
 * this package's resume binding are resolvable here; the rest must be visible
 * but inert, never silently translated into a resolvable AI-domain interrupt.
 */
test.describe('foreign interrupts', () => {
  test('an interrupt with no binding is unbound and unresolvable', async ({
    page,
  }) => {
    await page.goto('/foreign-interrupt')

    await expect(page.getByTestId('interrupt-count')).toHaveText('2')

    // Ours: bound, resolvable.
    await expect(page.getByTestId('kind-ours')).toHaveText('generic')
    await expect(page.getByTestId('can-resolve-ours')).toHaveText('true')
    await expect(page.getByTestId('resolve-ours')).toBeVisible()

    // Theirs: no binding, so it is surfaced as unbound with no resolver.
    await expect(page.getByTestId('kind-theirs')).toHaveText('unbound')
    await expect(page.getByTestId('can-resolve-theirs')).toHaveText('false')
    await expect(page.getByTestId('resolve-theirs')).toHaveCount(0)

    // Still shown, so a UI can tell the user the run is paused.
    await expect(page.getByTestId('message-theirs')).toHaveText(
      'Approve the deployment?',
    )
  })

  test('an unbound interrupt does not block resolving the bound one', async ({
    page,
  }) => {
    await page.goto('/foreign-interrupt')

    await expect(page.getByTestId('resolve-ours')).toBeVisible()
    await page.getByTestId('resolve-ours').click()

    // The continuation run happening at all proves the batch submitted with
    // only the interrupt we own — the foreign one is excluded from the
    // completeness gate rather than deadlocking it.
    await expect(page.getByTestId('assistant-text')).toHaveText('resumed:ours')
  })
})
