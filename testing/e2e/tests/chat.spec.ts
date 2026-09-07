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
              id: 'result-1',
              name: 'getWeather',
              toolCallId: 'tool-1',
              content: [{ type: 'text', content: '{"temp":72}' }],
              state: 'complete',
              metadata: { source: 'e2e' },
              createdAt: '2026-08-20T00:00:00.000Z',
            },
          ],
        },
      ],
    },
  })

  expect(response.ok()).toBe(true)
  const { modelMessages, wireMessages, snapshots, mergedSnapshots } =
    await response.json()

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
      id: 'result-1',
      role: 'tool',
      name: 'getWeather',
      content: [{ type: 'text', content: '{"temp":72}' }],
      toolCallId: 'tool-1',
      metadata: { source: 'e2e' },
      createdAt: '2026-08-20T00:00:00.000Z',
    },
  ])
  expect(wireMessages).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ role: 'assistant', id: 'assistant-1' }),
      expect.objectContaining({
        role: 'tool',
        toolCallId: 'tool-1',
        id: 'result-1',
        metadata: {
          source: 'e2e',
          tanstack: {
            toolResult: {
              id: 'result-1',
              createdAt: '2026-08-20T00:00:00.000Z',
              content: [{ type: 'text', content: '{"temp":72}' }],
            },
          },
        },
      }),
    ]),
  )
  expect(snapshots).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        id: 'assistant-1',
        role: 'assistant',
        parts: expect.arrayContaining([
          expect.objectContaining({
            type: 'tool-result',
            id: 'result-1',
            content: [{ type: 'text', content: '{"temp":72}' }],
            metadata: { source: 'e2e' },
          }),
        ]),
      }),
    ]),
  )
  const mergedAssistant = mergedSnapshots.find(
    (message: { id?: string }) => message.id === 'assistant-1',
  )
  expect(mergedAssistant?.parts).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        type: 'tool-result',
        id: 'result-1',
        content: [{ type: 'text', content: '{"temp":72}' }],
        metadata: { source: 'e2e' },
        createdAt: '2026-08-20T00:00:00.000Z',
      }),
    ]),
  )
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

    const hydrationErrors: Array<string> = []
    page.on('pageerror', (error) => {
      if (
        /hydration failed|hydrated but|server rendered html/i.test(
          error.message,
        )
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

    await expect(page.getByTestId('user-message')).toContainText(
      '[chat] recommend a guitar',
    )
    await expect(page.getByTestId('assistant-message')).toContainText(
      'Fender Stratocaster',
    )
    expect(hydrationErrors).toEqual([])
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
