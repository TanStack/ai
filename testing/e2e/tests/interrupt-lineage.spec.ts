import { expect, test } from '@playwright/test'

for (const scenario of [
  {
    name: 'completion clears an earlier parent pause',
    events: [
      'Start parent',
      'Pause parent',
      'Link child',
      'Finish child',
      'Pause parent',
    ],
    pending: [0, 1, 1, 0, 0],
  },
  {
    name: 'a late parent link prevents a stale pause',
    events: ['Finish child', 'Link child', 'Pause parent'],
    pending: [0, 0, 0],
  },
  {
    name: 'a late parent link clears a visible pause',
    events: ['Start parent', 'Pause parent', 'Finish child', 'Link child'],
    pending: [0, 1, 1, 0],
  },
]) {
  test(scenario.name, async ({ page }) => {
    await page.goto('/interrupt-lineage')
    for (const [index, event] of scenario.events.entries()) {
      await page.getByRole('button', { name: event, exact: true }).click()
      await expect(page.getByTestId('event-count')).toHaveText(
        String(index + 1),
      )
      await expect(page.getByTestId('interrupt-count')).toHaveText(
        String(scenario.pending[index]),
      )
      await expect(
        page.getByText('Approve this step?', { exact: true }),
      ).toHaveCount(scenario.pending[index]!)
    }
  })
}
