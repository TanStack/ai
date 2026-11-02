import { RUN_CANCEL_REASON } from '@tanstack/ai'
import { ChatClient, fetchServerSentEvents } from '@tanstack/ai-client'
import { test, expect } from './fixtures'
import type { APIRequestContext } from '@playwright/test'

const ROUTE = 'http://localhost:3010/api/durable-delivery-cancel'

function startRun(testId: string) {
  const client = new ChatClient({
    threadId: `thread-durable-cancel-${testId}`,
    connection: fetchServerSentEvents(ROUTE, {
      cancelUrl: `${ROUTE}?op=cancel`,
    }),
  })
  void client.sendMessage('go')
  return client
}

async function ending(
  request: APIRequestContext,
  runId: string,
): Promise<unknown> {
  const response = await request.get(
    `${ROUTE}?runId=${encodeURIComponent(runId)}`,
  )
  const body = await response.json()
  return typeof body === 'object' && body !== null && 'ending' in body
    ? body.ending
    : undefined
}

test.describe('durable HTTP delivery: cancelUrl', () => {
  test('stop() cancels the server run', async ({ request, testId }) => {
    const client = startRun(testId)
    try {
      await expect.poll(() => client.getSnapshot().status).toBe('streaming')
      const runId = client.getCurrentRunId()
      expect(runId).toEqual(expect.any(String))

      client.stop()

      await expect
        .poll(() => ending(request, runId ?? ''))
        .toBe(RUN_CANCEL_REASON)
    } finally {
      client.unsubscribe()
    }
  })

  test('an unsubscribe without stop() lets the run finish', async ({
    request,
    testId,
  }) => {
    const client = startRun(testId)
    await expect.poll(() => client.getSnapshot().status).toBe('streaming')
    const runId = client.getCurrentRunId()

    client.unsubscribe()

    await expect.poll(() => ending(request, runId ?? '')).toBe('finished')
  })
})
