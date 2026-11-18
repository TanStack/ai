import { expect, test } from './fixtures'
import { sendMessage, waitForAssistantText, waitForResponse } from './helpers'
import type { Page } from '@playwright/test'

/**
 * Tool result metadata. The `search_docs` server tool in
 * `/api/tool-result-metadata` sets `sources` with `setResultMetadata`.
 *
 * - The page shows the sources from `part.resultMetadata`.
 * - The model (aimock) never gets the sources.
 * - The client does not send the sources back to the server.
 * - A reload hydrates the server transcript, and the sources show again.
 *
 * Fixtures are in `fixtures/tool-result-metadata/`.
 */

const FIRST_PROMPT = '[tool-result-metadata] find the lighthouse docs'
const SECOND_PROMPT = '[tool-result-metadata] thanks'
const SOURCE_TITLES = ['Lighthouse guide', 'Keeper log']
// Text that only the result metadata holds.
const SOURCE_HOST = 'docs.example.com'
// Text that only the tool output holds. The model must get it.
const TOOL_OUTPUT = 'LIGHTHOUSE_ANSWER'

type WireRow = { role: string; metadata?: Record<string, unknown> }

type JournalEntry = {
  headers?: Record<string, string>
  body: { messages?: Array<{ role: string }> } | null
}

/** Collects the body of every chat POST the page sends. */
function trackChatPosts(page: Page) {
  const bodies: Array<{ messages: Array<WireRow> }> = []
  page.on('request', (request) => {
    const url = new URL(request.url())
    if (
      request.method() === 'POST' &&
      url.pathname === '/api/tool-result-metadata'
    ) {
      bodies.push(request.postDataJSON())
    }
  })
  return bodies
}

/** The metadata keys of a wire row, without the reserved `tanstack` key. */
function appKeys(row: WireRow) {
  return Object.keys(row.metadata ?? {}).filter((key) => key !== 'tanstack')
}

test.describe('tool result metadata', () => {
  test('the page shows the sources, and the model and the server do not get them', async ({
    page,
    request,
    testId,
    aimockPort,
  }) => {
    const chatPosts = trackChatPosts(page)
    await page.goto(
      `/tool-result-metadata?testId=${encodeURIComponent(testId)}&aimockPort=${aimockPort}`,
    )
    await expect(page.getByTestId('hydration-marker')).toBeAttached()

    await sendMessage(page, FIRST_PROMPT)
    await waitForAssistantText(page, 'RESULT_META_OK')
    await waitForResponse(page)
    await expect(page.getByTestId('result-source')).toHaveText(SOURCE_TITLES)

    // The second turn sends the tool row back with no app metadata.
    await sendMessage(page, SECOND_PROMPT)
    await waitForAssistantText(page, 'RESULT_META_SECOND_OK')
    await waitForResponse(page)
    expect(chatPosts).toHaveLength(2)
    const toolRows = (chatPosts[1]?.messages ?? []).filter(
      (row) => row.role === 'tool',
    )
    expect(toolRows).toHaveLength(1)
    expect(toolRows.map(appKeys)).toEqual([[]])
    expect(JSON.stringify(chatPosts[1])).not.toContain(SOURCE_HOST)

    // Both model requests with the tool row (the turn 1 follow-up and turn 2)
    // have the tool output and no sources.
    const journal = await request.get(
      `http://127.0.0.1:${aimockPort}/v1/_requests`,
    )
    const entries: Array<JournalEntry> = await journal.json()
    // Other specs use the same aimock. Read only this test's requests.
    const modelBodies = entries
      .filter(
        (entry) =>
          entry.headers?.['x-test-id'] === testId &&
          entry.body?.messages?.some((message) => message.role === 'tool'),
      )
      .map((entry) => JSON.stringify(entry.body))
    expect(modelBodies).toHaveLength(2)
    for (const body of modelBodies) {
      expect(body).toContain(TOOL_OUTPUT)
      expect(body).not.toContain(SOURCE_HOST)
    }

    // The server transcript kept the metadata, so a reload shows it again.
    await page.reload()
    await expect(page.getByTestId('hydration-marker')).toBeAttached()
    await expect(page.getByTestId('assistant-message').last()).toContainText(
      'RESULT_META_SECOND_OK',
    )
    await expect(page.getByTestId('result-source')).toHaveText(SOURCE_TITLES)
  })
})
