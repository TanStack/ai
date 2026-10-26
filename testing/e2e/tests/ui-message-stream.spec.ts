import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

/**
 * `@tanstack/ai-ui-message-stream` connects TanStack AI and the AI SDK UI
 * message stream in both directions. Each page lists its scenarios; the
 * `?prompt=` prefix picks one.
 */
function open(page: Page, path: string, prompt: string) {
  return page.goto(`${path}?${new URLSearchParams({ prompt })}`)
}

test.describe('AI SDK UI message stream: AI SDK client, TanStack server', () => {
  test('reads a chat() route', async ({ page }) => {
    await page.goto('/ai-sdk-client')

    await expect(page.getByTestId('tool-outputs')).toHaveText('sunny in Oslo')
    await expect(page.getByTestId('assistant-text')).toHaveText(
      'Tool said: sunny in Oslo',
    )
  })

  test('approves a server tool', async ({ page }) => {
    await open(page, '/ai-sdk-client', 'Delete a.txt')

    await page.getByTestId('approve-button').click()

    await expect(page.getByTestId('tool-outputs')).toHaveText('deleted a.txt')
    await expect(page.getByTestId('assistant-text')).toHaveText(
      'Tool said: deleted a.txt',
    )
  })

  test('denies a server tool', async ({ page }) => {
    await open(page, '/ai-sdk-client', 'Delete a.txt')

    await page.getByTestId('deny-button').click()

    await expect(page.getByTestId('tool-states')).toHaveText(
      'deleteFile:output-denied',
    )
    await expect(page.getByTestId('assistant-text')).toContainText('Tool said:')
    await expect(page.getByTestId('tool-outputs')).toHaveText('')
  })

  test('shows a chat() RUN_ERROR as an error', async ({ page }) => {
    await open(page, '/ai-sdk-client', '[error] hi')

    await expect(page.getByTestId('error')).toHaveText('The model is down')
    await expect(page.getByTestId('status')).toHaveText('error')
  })

  test('shows an error that the route throws mid-reply', async ({ page }) => {
    await open(page, '/ai-sdk-client', '[crash] hi')

    await expect(page.getByTestId('error')).toHaveText(
      'The route crashed mid-reply',
    )
    await expect(page.getByTestId('status')).toHaveText('error')
  })

  test('shows a throwing server tool as output-error', async ({ page }) => {
    await open(page, '/ai-sdk-client', '[tool-throws] hi')

    await expect(page.getByTestId('tool-states')).toHaveText(
      'explode:output-error',
    )
    await expect(page.getByTestId('tool-errors')).toContainText('Disk on fire')
    await expect(page.getByTestId('assistant-text')).toContainText(
      'Disk on fire',
    )
  })

  test('does not run a tool call with broken arguments', async ({ page }) => {
    await open(page, '/ai-sdk-client', '[bad-args] hi')

    await expect(page.getByTestId('tool-states')).toHaveText(
      'getWeather:output-error',
    )
    await expect(page.getByTestId('tool-errors')).toHaveText(
      'The tool call arguments are not valid JSON.',
    )
    await expect(page.getByTestId('tool-outputs')).toHaveText('')
  })

  test('continues one assistant message after a client tool', async ({
    page,
  }) => {
    await open(page, '/ai-sdk-client', '[client-tool] where am I?')

    await expect(page.getByTestId('assistant-text')).toHaveText(
      'Tool said: Berlin',
    )
    await expect(page.getByTestId('assistant-count')).toHaveText('1')
    await expect(page.getByTestId('tool-states')).toHaveText(
      'getLocation:output-available',
    )
  })

  test('shows reasoning', async ({ page }) => {
    await open(page, '/ai-sdk-client', '[reasoning] hi')

    await expect(page.getByTestId('reasoning')).toHaveText(
      'Look at the map first.',
    )
    await expect(page.getByTestId('assistant-text')).toHaveText(
      'Oslo is in Norway.',
    )
  })

  test('shows an activity as one data part updated in place', async ({
    page,
  }) => {
    await open(page, '/ai-sdk-client', '[activity] hi')

    await expect(page.getByTestId('assistant-text')).toHaveText('Found 3.')
    await expect(page.getByTestId('data-parts')).toHaveText(
      'data-search:{"status":"done","hits":3}',
    )
  })

  test('stops a reply mid-stream', async ({ page }) => {
    await open(page, '/ai-sdk-client', '[slow] count')
    await expect(page.getByTestId('assistant-text')).toContainText('One.')

    await page.getByTestId('stop-button').click()

    await expect(page.getByTestId('status')).toHaveText('ready')
    const stopped = await page.getByTestId('assistant-text').textContent()
    await page.waitForTimeout(1000)
    await expect(page.getByTestId('assistant-text')).toHaveText(stopped ?? '')
    expect(stopped).not.toContain('Fifteen.')
  })

  test('resumes a run after a reload', async ({ page }) => {
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
})

test.describe('AI SDK UI message stream: TanStack client, AI SDK server', () => {
  test('reads a streamText route', async ({ page }) => {
    await page.goto('/ai-sdk-server')

    await expect(page.getByTestId('assistant-text')).toContainText(
      'Fender Stratocaster',
    )
  })

  test('approves an AI SDK tool', async ({ page }) => {
    await open(page, '/ai-sdk-server', '[ai-sdk-approval] buy the stratocaster')

    await page.getByTestId('approve-button').click()

    await expect(page.getByTestId('tool-results')).toHaveText('{"added":"1"}')
    await expect(page.getByTestId('assistant-text')).toHaveText(
      'The Stratocaster is in your cart.',
    )
  })

  test('denies an AI SDK tool', async ({ page }) => {
    await open(page, '/ai-sdk-server', '[ai-sdk-deny] buy the stratocaster')

    await page.getByTestId('deny-button').click()

    await expect(page.getByTestId('assistant-text')).toHaveText(
      'Nothing was added.',
    )
    await expect(page.getByTestId('tool-results')).not.toContainText('added')
  })

  test('shows an AI SDK tool-output-error', async ({ page }) => {
    await open(page, '/ai-sdk-server', '[ai-sdk-tool-error]')

    await expect(page.getByTestId('tool-results')).toContainText('Disk on fire')
    await expect(page.getByTestId('tool-result-states')).toContainText('error')
    await expect(page.getByTestId('assistant-text')).toHaveText(
      'The tool failed.',
    )
  })

  test('shows an AI SDK tool-input-error', async ({ page }) => {
    await open(page, '/ai-sdk-server', '[ai-sdk-bad-args]')

    await expect(page.getByTestId('tool-results')).toContainText(
      'Invalid input for tool lookup',
    )
    await expect(page.getByTestId('tool-result-states')).toContainText('error')
    await expect(page.getByTestId('assistant-text')).toHaveText(
      'Those arguments were broken.',
    )
  })

  test('runs a TanStack client tool for an AI SDK route', async ({ page }) => {
    await open(page, '/ai-sdk-server', '[ai-sdk-client-tool]')

    await expect(page.getByTestId('assistant-text')).toHaveText(
      'You are in Berlin.',
    )
  })

  test('shows AI SDK reasoning as thinking', async ({ page }) => {
    await open(page, '/ai-sdk-server', '[ai-sdk-reasoning]')

    await expect(page.getByTestId('thinking')).toHaveText('Compare necks.')
    await expect(page.getByTestId('assistant-text')).toHaveText(
      'Pick the Stratocaster.',
    )
  })

  test('shows Output.object as structured output', async ({ page }) => {
    await open(page, '/ai-sdk-server', '[ai-sdk-structured]')

    await expect(page.getByTestId('structured')).toHaveText(
      '{"name":"Stratocaster","price":1299}',
    )
    await expect(page.getByTestId('error')).toHaveText('')
  })

  test('shows an AI SDK data part as one activity', async ({ page }) => {
    await open(page, '/ai-sdk-server', '[ai-sdk-data]')

    await expect(page.getByTestId('assistant-text')).toHaveText('Found 3.')
    await expect(page.getByTestId('activity-content')).toHaveText([
      '{"status":"done","hits":3}',
    ])
  })

  test('keeps two data types with the same id apart', async ({ page }) => {
    await open(page, '/ai-sdk-server', '[ai-sdk-data-two]')

    await expect(page.getByTestId('assistant-text')).toHaveText('Two parts.')
    await expect(page.getByTestId('activity-content')).toHaveText([
      '{"hits":3}',
      '{"sky":"clear"}',
    ])
  })

  test('shows an AI SDK error chunk as an error', async ({ page }) => {
    await open(page, '/ai-sdk-server', '[ai-sdk-error]')

    await expect(page.getByTestId('error')).toHaveText('Upstream failed')
    await expect(page.getByTestId('assistant-text')).toHaveText('Partial')
  })

  test('ends a run on an AI SDK abort chunk, with no error', async ({
    page,
  }) => {
    await open(page, '/ai-sdk-server', '[ai-sdk-abort]')

    await expect(page.getByTestId('assistant-text')).toHaveText('Stopping here')
    await expect(page.getByTestId('status')).toHaveText('ready')
    await expect(page.getByTestId('error')).toHaveText('')
  })

  test('reconnects once when the stream ends before finish', async ({
    page,
  }) => {
    const reconnect = page.waitForRequest((r) => r.url().endsWith('/stream'))
    await open(page, '/ai-sdk-server', '[ai-sdk-early-end]')

    await reconnect
    await expect(page.getByTestId('assistant-text')).toHaveText('Partial')
    await expect(page.getByTestId('status')).toHaveText('ready')
    await expect(page.getByTestId('error')).toHaveText('')
  })

  test('fails a dropped stream at once when the route cannot resume', async ({
    page,
  }) => {
    await open(page, '/ai-sdk-server', '[ai-sdk-drop]')

    await expect(page.getByTestId('assistant-text')).toHaveText(
      'Before the drop',
    )
    // The resume GET is a 404, so there is no backoff up to the limit.
    await expect(page.getByTestId('error')).not.toHaveText('', {
      timeout: 5_000,
    })
    await expect(page.getByTestId('error')).not.toContainText(/limit/i)
  })
})
