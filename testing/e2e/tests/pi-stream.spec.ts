import { expect, test } from '@playwright/test'

/**
 * `@tanstack/ai-pi-stream` converts between TanStack AI (AG-UI) events and pi
 * agent events in both directions.
 */
test.describe('pi agent events', () => {
  test('TanStack useChat reads a pi agent loop', async ({ page }) => {
    await page.goto('/pi-agent')

    await expect(page.getByTestId('tool-results')).toHaveText('sunny in Oslo')
    await expect(page.getByTestId('assistant-text')).toHaveText(
      'Tool said: sunny in Oslo',
    )
  })

  test('TanStack useChat approves a pi tool call', async ({ page }) => {
    await page.goto('/pi-agent?prompt=Delete%20a.txt')

    await page.getByTestId('approve-button').click()

    await expect(page.getByTestId('tool-results')).toHaveText('deleted a.txt')
    await expect(page.getByTestId('assistant-text')).toHaveText(
      'Tool said: deleted a.txt',
    )
  })

  test('a pi client reads a TanStack chat() route', async ({ page }) => {
    await page.goto('/pi-client')

    await expect(page.getByTestId('agent-ended')).toHaveText('true')
    await expect(page.getByTestId('tool-results')).toHaveText('sunny in Oslo')
    await expect(page.getByTestId('assistant-text')).toHaveText(
      'Tool said: sunny in Oslo',
    )
  })
})
