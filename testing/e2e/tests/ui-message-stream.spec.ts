import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'

/**
 * `@tanstack/ai-ui-message-stream` connects TanStack AI and the AI SDK UI
 * message stream in both directions.
 */
test.describe('AI SDK UI message stream', () => {
  test('AI SDK useChat reads a TanStack chat() route', async ({ page }) => {
    await page.goto('/ai-sdk-client')

    await expect(page.getByTestId('tool-outputs')).toHaveText('sunny in Oslo')
    await expect(page.getByTestId('assistant-text')).toHaveText(
      'Tool said: sunny in Oslo',
    )
  })

  test('AI SDK useChat approves a TanStack server tool', async ({ page }) => {
    await page.goto(
      `/ai-sdk-client?${new URLSearchParams({ prompt: 'Delete a.txt' })}`,
    )

    await page.getByTestId('approve-button').click()

    await expect(page.getByTestId('tool-outputs')).toHaveText('deleted a.txt')
    await expect(page.getByTestId('assistant-text')).toHaveText(
      'Tool said: deleted a.txt',
    )
  })

  test('AI SDK useChat resumes a TanStack run after a reload', async ({
    page,
  }) => {
    const reply =
      'River stones rest under clear cold water while the slow current carries leaves toward the quiet village mill.'
    // On mount, `resume: true` asks for the active run. Wait for that 204
    // before sending, so the send does not race it.
    const resumeCheck = page.waitForResponse((r) => r.url().endsWith('/stream'))
    await page.goto(`/ai-sdk-resume?chat=resume-${randomUUID()}`)
    await resumeCheck
    await page.getByTestId('send-button').click()
    await expect(page.getByTestId('assistant-text')).toContainText('River')

    await page.reload()

    await expect(page.getByTestId('assistant-text')).toHaveText(reply)
    await expect(page.getByTestId('assistant-count')).toHaveText('1')
  })

  test('TanStack useChat reads an AI SDK streamText route', async ({
    page,
  }) => {
    await page.goto('/ai-sdk-server')

    await expect(page.getByTestId('assistant-text')).toContainText(
      'Fender Stratocaster',
    )
  })

  test('TanStack useChat approves an AI SDK tool', async ({ page }) => {
    await page.goto(
      `/ai-sdk-server?${new URLSearchParams({ prompt: '[ai-sdk-approval] buy the stratocaster' })}`,
    )

    await page.getByTestId('approve-button').click()

    await expect(page.getByTestId('tool-results')).toHaveText('{"added":"1"}')
    await expect(page.getByTestId('assistant-text')).toHaveText(
      'The Stratocaster is in your cart.',
    )
  })

  test('TanStack useChat shows an AI SDK data part as one activity', async ({
    page,
  }) => {
    await page.goto(
      `/ai-sdk-server?${new URLSearchParams({ prompt: '[ai-sdk-data]' })}`,
    )

    await expect(page.getByTestId('assistant-text')).toHaveText('Found 3.')
    await expect(page.getByTestId('activity-content')).toHaveText([
      '{"status":"done","hits":3}',
    ])
  })
})
