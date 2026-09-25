import { test, expect } from '../fixtures'
import { selectScenario, runTest, getMessages } from './helpers'
import type { APIRequestContext, Page } from '@playwright/test'

/**
 * Regression for #1283.
 *
 * A server tool (get_screenshot) returns ContentPart[] with an image, and the
 * run finishes. The user then sends a second message, so the client sends the
 * history back. The image must still be a structured tool output on that
 * request, not a JSON string.
 */

type JournalEntry = {
  headers?: Record<string, string>
  body: {
    messages?: Array<{ role?: string; content?: unknown }>
  } | null
}

async function journalForTest(
  request: APIRequestContext,
  aimockPort: number,
  testId: string,
): Promise<Array<JournalEntry>> {
  const res = await request.get(`http://127.0.0.1:${aimockPort}/v1/_requests`)
  return ((await res.json()) as Array<JournalEntry>).filter(
    (entry) => entry.headers?.['x-test-id'] === testId,
  )
}

async function waitForIdle(page: Page): Promise<void> {
  await page.waitForFunction(
    () =>
      document
        .getElementById('test-metadata')
        ?.getAttribute('data-is-loading') === 'false',
    undefined,
    { timeout: 15000 },
  )
}

test('multimodal server tool result keeps its image on the next user turn', async ({
  page,
  request,
  testId,
  aimockPort,
}) => {
  await selectScenario(page, 'multimodal-server-tool', testId, aimockPort)

  // Turn 1: tool call, then the final text after the server tool ran.
  await runTest(page)
  await expect
    .poll(
      async () => (await journalForTest(request, aimockPort, testId)).length,
    )
    .toBe(2)
  await waitForIdle(page)

  // Client state: the tool-result part keeps the parsed array.
  const messages = await getMessages(page)
  const parts = messages.flatMap((message) => message.parts || [])
  const screenshot = parts.find(
    (part: any) => part.type === 'tool-call' && part.name === 'get_screenshot',
  )
  const result = parts.find(
    (part: any) =>
      part.type === 'tool-result' && part.toolCallId === screenshot?.id,
  )
  expect(Array.isArray(result?.content)).toBe(true)

  // Turn 2: the history round trips through the client.
  await runTest(page)
  await expect
    .poll(
      async () => (await journalForTest(request, aimockPort, testId)).length,
    )
    .toBe(3)

  const [, , nextTurn] = await journalForTest(request, aimockPort, testId)
  const content = nextTurn?.body?.messages?.find(
    (message) => message.role === 'tool',
  )?.content
  // On the bug, this is a JSON string of the parts, not an array.
  expect(Array.isArray(content)).toBe(true)
  expect(
    Array.isArray(content) &&
      content.some((part: any) => part.type === 'input_image'),
  ).toBe(true)
})
