import { test, expect } from './fixtures'
import {
  sendMessage,
  waitForResponse,
  getLastAssistantMessage,
  featureUrl,
} from './helpers'
import { providersFor } from './test-matrix'

for (const provider of providersFor('chat')) {
  test.describe(`${provider} — chat`, () => {
    test('sends a message and receives a streaming response', async ({
      page,
      testId,
      aimockPort,
    }) => {
      await page.goto(featureUrl(provider, 'chat', testId, aimockPort))

      await sendMessage(page, '[chat] recommend a guitar')
      await waitForResponse(page)

      const response = await getLastAssistantMessage(page)
      expect(response).toContain('Fender Stratocaster')
    })

    test('fetcher mode — streams an SSE Response through useChat({ fetcher })', async ({
      page,
      testId,
      aimockPort,
    }) => {
      await page.goto(
        featureUrl(provider, 'chat', testId, aimockPort, 'fetcher'),
      )

      // Positively assert the fetcher path executed by waiting for the
      // POST that carries our sentinel header. Without this, a silent
      // fallback to the connection adapter would still make the response
      // assertion pass (both paths return the same SSE).
      const fetcherRequest = page.waitForRequest(
        (req) =>
          req.url().endsWith('/api/chat') &&
          req.method() === 'POST' &&
          req.headers()['x-tanstack-ai-transport'] === 'fetcher',
      )

      await sendMessage(page, '[chat] recommend a guitar')
      await fetcherRequest
      await waitForResponse(page)

      const response = await getLastAssistantMessage(page)
      expect(response).toContain('Fender Stratocaster')
    })
  })
}

test.describe('openrouter root metadata', () => {
  test('streams when root observability metadata is structured', async ({
    page,
    testId,
    aimockPort,
  }) => {
    await page.goto(
      `${featureUrl('openrouter', 'chat', testId, aimockPort)}&rootMetadata=structured`,
    )

    await sendMessage(page, '[chat] recommend a guitar')
    await waitForResponse(page)

    const response = await getLastAssistantMessage(page)
    expect(response).toContain('Fender Stratocaster')
  })
})

test.describe('openai chat persistence', () => {
  test('persists chat messages across browser reload with localStorage', async ({
    page,
    testId,
    aimockPort,
  }) => {
    await page.goto(
      `${featureUrl('openai', 'chat', testId, aimockPort)}&persistence=localStorage`,
    )

    await sendMessage(page, '[chat] recommend a guitar')
    await waitForResponse(page)

    await expect(page.getByTestId('user-message')).toContainText(
      '[chat] recommend a guitar',
    )
    await expect(page.getByTestId('assistant-message')).toContainText(
      'Fender Stratocaster',
    )

    await page.reload()

    await expect(page.getByTestId('user-message')).toContainText(
      '[chat] recommend a guitar',
    )
    await expect(page.getByTestId('assistant-message')).toContainText(
      'Fender Stratocaster',
    )
  })

  test('clear() removes the persisted conversation so a reload starts empty', async ({
    page,
    testId,
    aimockPort,
  }) => {
    await page.goto(
      `${featureUrl('openai', 'chat', testId, aimockPort)}&persistence=localStorage`,
    )

    await sendMessage(page, '[chat] recommend a guitar')
    await waitForResponse(page)
    await expect(page.getByTestId('user-message')).toContainText(
      '[chat] recommend a guitar',
    )

    await page.getByTestId('clear-button').click()
    await expect(page.getByTestId('user-message')).toHaveCount(0)
    await expect(page.getByTestId('assistant-message')).toHaveCount(0)

    // The conversation was removed from storage, not just from memory — a
    // reload must not resurrect it.
    await page.reload()
    await expect(page.getByTestId('message-list')).toBeVisible()
    await expect(page.getByTestId('user-message')).toHaveCount(0)
    await expect(page.getByTestId('assistant-message')).toHaveCount(0)
  })

  test('switches per-thread history when the chat id changes in place', async ({
    page,
    testId,
    aimockPort,
  }) => {
    await page.goto(
      `${featureUrl('openai', 'chat', testId, aimockPort)}&persistence=localStorage`,
    )

    // The page loads on thread A. Send a message (persisted under A's own id).
    await sendMessage(page, '[chat] recommend a guitar')
    await waitForResponse(page)
    await expect(page.getByTestId('user-message')).toHaveCount(1)

    // Switch to thread B in place — its own (empty) history loads, proving the
    // id swap doesn't leak thread A's messages into thread B.
    await page.getByTestId('select-thread-b').click()
    await expect(page.getByTestId('user-message')).toHaveCount(0)
    await expect(page.getByTestId('assistant-message')).toHaveCount(0)

    await sendMessage(page, '[chat] recommend a guitar')
    await waitForResponse(page)
    await expect(page.getByTestId('user-message')).toHaveCount(1)

    // Switch back to thread A — its persisted history is restored from storage
    // on the in-place swap (render-from-getMessages), exactly one message.
    await page.getByTestId('select-thread-a').click()
    await expect(page.getByTestId('user-message')).toHaveCount(1)
    await expect(page.getByTestId('user-message')).toContainText(
      '[chat] recommend a guitar',
    )
    await expect(page.getByTestId('assistant-message')).toContainText(
      'Fender Stratocaster',
    )
  })
})
