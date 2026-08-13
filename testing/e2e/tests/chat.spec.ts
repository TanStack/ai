import { test, expect } from './fixtures'
import {
  sendMessage,
  waitForResponse,
  getLastAssistantMessage,
  featureUrl,
} from './helpers'
import { providersFor } from './test-matrix'

// The server conversion test in this spec does not call a provider HTTP
// endpoint, so it intentionally does not configure aimock.

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

test('preserves UI message IDs at the server conversion boundary', async ({
  request,
}) => {
  const response = await request.post('/api/message-ids', {
    data: {
      messages: [
        {
          id: 'user-1',
          role: 'user',
          parts: [{ type: 'text', content: 'Hello' }],
        },
        {
          id: 'assistant-1',
          role: 'assistant',
          parts: [
            { type: 'text', content: 'Let me check.' },
            {
              type: 'tool-call',
              id: 'tool-1',
              name: 'getWeather',
              arguments: '{}',
              state: 'input-complete',
            },
            {
              type: 'tool-result',
              toolCallId: 'tool-1',
              content: '{"temp":72}',
              state: 'complete',
            },
          ],
        },
      ],
    },
  })

  expect(response.ok()).toBe(true)
  const modelMessages = await response.json()

  expect(modelMessages).toEqual([
    { id: 'user-1', role: 'user', content: 'Hello' },
    {
      id: 'assistant-1',
      role: 'assistant',
      content: 'Let me check.',
      toolCalls: [
        {
          id: 'tool-1',
          type: 'function',
          function: { name: 'getWeather', arguments: '{}' },
        },
      ],
    },
    {
      id: 'assistant-1',
      role: 'tool',
      content: '{"temp":72}',
      toolCallId: 'tool-1',
    },
  ])
})

test('rejects malformed JSON at the server conversion boundary', async ({
  request,
}) => {
  const response = await request.post('/api/message-ids', {
    data: '{',
    headers: { 'Content-Type': 'application/json' },
  })

  expect(response.status()).toBe(400)
})

test('rejects invalid message parts at the server conversion boundary', async ({
  request,
}) => {
  const response = await request.post('/api/message-ids', {
    data: {
      messages: [
        {
          id: 'user-1',
          role: 'user',
          parts: [{ type: 'text', content: 42 }],
        },
      ],
    },
  })

  expect(response.status()).toBe(400)
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
