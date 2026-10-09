import { expect, test } from './fixtures'
import {
  approveToolCall,
  sendMessage,
  waitForAssistantText,
  waitForResponse,
} from './helpers'
import type { Page } from '@playwright/test'

/**
 * JSON transport (`toJsonResponse` + `fetchJson`).
 *
 * The server answers each request with one `{ chunks, offset?, done }` JSON
 * body instead of a stream. `/api/json-transport` runs `chat()` against aimock
 * (fixtures in `fixtures/json-transport/`) and drains the run into a
 * `memoryStream` log. `?maxWaitMs=` makes it reply early with `done: false`,
 * and the client polls `GET ?runId=&offset=` for the rest. The page runs
 * `persistence: true`, so a reload hydrates `activeRun` and the client joins
 * the run with `joinRun` (`GET ?runId=&offset=-1`).
 */

const LONG_PROMPT = '[json-transport-long] tell me about the lighthouse'
const LONG_START = 'The lighthouse keeper climbed the stairs'
const LONG_END = 'JSON_LONG_END'

function pageUrl(testId: string, aimockPort: number, maxWaitMs?: number) {
  const query = new URLSearchParams({
    testId,
    aimockPort: String(aimockPort),
  })
  if (maxWaitMs !== undefined) query.set('maxWaitMs', String(maxWaitMs))
  return `/json-transport?${query.toString()}`
}

/** Collects the `offset` of every GET that reads the run log. */
function trackLogReads(page: Page) {
  const offsets: Array<string> = []
  page.on('request', (request) => {
    const url = new URL(request.url())
    const offset = url.searchParams.get('offset')
    if (
      request.method() === 'GET' &&
      url.pathname === '/api/json-transport' &&
      offset !== null
    ) {
      offsets.push(offset)
    }
  })
  return offsets
}

async function openPage(page: Page, url: string) {
  await page.goto(url)
  await expect(page.getByTestId('hydration-marker')).toBeAttached()
}

test.describe('json transport', () => {
  test('a chat turn shows the full answer from one JSON reply', async ({
    page,
    testId,
    aimockPort,
  }) => {
    const logReads = trackLogReads(page)
    await openPage(page, pageUrl(testId, aimockPort))

    await sendMessage(page, '[json-transport-text] say hello')
    await waitForAssistantText(
      page,
      'JSON_TEXT_OK the whole answer came back in one JSON reply.',
    )
    await waitForResponse(page)

    // No maxWaitMs: the POST waits for the run to end, so there is no poll.
    expect(logReads).toEqual([])
  })

  test('a server tool completes over JSON', async ({
    page,
    testId,
    aimockPort,
  }) => {
    await openPage(page, pageUrl(testId, aimockPort))

    await sendMessage(
      page,
      '[json-transport-server-tool] weather in san francisco',
    )
    await waitForAssistantText(
      page,
      'JSON_SERVER_TOOL_OK San Francisco is 72F and sunny.',
    )
    await expect(page.getByTestId('tool-call-get_weather')).toBeVisible()
  })

  test('a client tool completes over JSON', async ({
    page,
    testId,
    aimockPort,
  }) => {
    await openPage(page, pageUrl(testId, aimockPort))

    await sendMessage(page, '[json-transport-client-tool] show a notification')
    // The second fixture answer needs a second POST that carries the client
    // tool result.
    await waitForAssistantText(
      page,
      'JSON_CLIENT_TOOL_OK the notification was shown.',
    )
    await expect(page.getByTestId('tool-call-show_notification')).toBeVisible()
  })

  test('an approved tool completes over JSON', async ({
    page,
    testId,
    aimockPort,
  }) => {
    await openPage(page, pageUrl(testId, aimockPort))

    await sendMessage(page, '[json-transport-approval] delete the temp file')
    await expect(page.getByTestId('approval-prompt-delete_file')).toBeVisible({
      timeout: 15_000,
    })
    await expect(page.getByTestId('message-list')).not.toContainText(
      'JSON_APPROVAL_OK',
    )

    await approveToolCall(page, 'delete_file')
    await waitForAssistantText(
      page,
      'JSON_APPROVAL_OK the file has been deleted.',
    )
    await expect(page.getByTestId('approval-prompt-delete_file')).toHaveCount(0)
  })

  test('a short maxWaitMs makes the client poll, and the answer is complete', async ({
    page,
    testId,
    aimockPort,
  }) => {
    const logReads = trackLogReads(page)
    await openPage(page, pageUrl(testId, aimockPort, 1))

    await sendMessage(page, LONG_PROMPT)
    await waitForAssistantText(page, LONG_END, 30_000)
    await waitForResponse(page)

    // The POST replied with done: false, so the rest came from polls that
    // carry a real offset (not the -1 of a join).
    expect(logReads.length).toBeGreaterThan(0)
    expect(logReads).not.toContain('-1')
    const answer = page.getByTestId('assistant-message').filter({
      hasText: LONG_END,
    })
    await expect(answer).toHaveCount(1)
    await expect(answer).toContainText(LONG_START)
  })

  test('a reload during a run joins it and the answer completes', async ({
    page,
    testId,
    aimockPort,
  }) => {
    const logReads = trackLogReads(page)
    // A short maxWaitMs shows the first words before the run ends, so the
    // reload happens while the run is still going.
    await openPage(page, pageUrl(testId, aimockPort, 200))

    await sendMessage(page, LONG_PROMPT)
    await waitForAssistantText(page, LONG_START, 15_000)
    await expect(page.getByTestId('message-list')).not.toContainText(LONG_END)

    await page.reload()
    await expect(page.getByTestId('hydration-marker')).toBeAttached()

    await waitForAssistantText(page, LONG_END, 30_000)
    await waitForResponse(page)

    // `joinRun` reads the log from the start with offset -1.
    expect(logReads).toContain('-1')
    await expect(page.getByTestId('user-message')).toHaveCount(1)
    const answer = page.getByTestId('assistant-message').filter({
      hasText: LONG_END,
    })
    await expect(answer).toHaveCount(1)
    await expect(answer).toContainText(LONG_START)
  })
})
