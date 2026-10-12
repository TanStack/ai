import type { APIRequestContext } from '@playwright/test'
import { test, expect } from './fixtures'
import {
  sendMessage,
  waitForResponse,
  getToolCalls,
  waitForAssistantText,
  featureUrl,
} from './helpers'
import { providersFor } from './test-matrix'

for (const provider of providersFor('tool-calling')) {
  test.describe(`${provider} — tool-calling`, () => {
    test('calls getGuitars and displays result', async ({
      page,
      testId,
      aimockPort,
    }) => {
      await page.goto(featureUrl(provider, 'tool-calling', testId, aimockPort))

      await sendMessage(page, '[toolcall] what guitars do you have in stock')
      await waitForResponse(page)

      const toolCalls = await getToolCalls(page)
      expect(toolCalls.length).toBeGreaterThanOrEqual(1)
      expect(toolCalls[0].name).toBe('getGuitars')

      // The parsed `input` is populated on the tool-call part (previously it
      // was always `undefined` at runtime — only `arguments` was set). It is
      // the raw `arguments` string parsed as JSON. `getGuitars` takes no
      // arguments, so it serializes as `{}` — assert the round-trip whenever
      // the args carry a JSON value (an empty/absent args string correctly
      // parses to no input, so we don't force a non-empty input there).
      const inputText = await page
        .getByTestId('tool-call-input-getGuitars')
        .locator('code')
        .first()
        .innerText()
      const argsText = (
        await page
          .getByTestId('tool-call-getGuitars')
          .locator('code')
          .first()
          .innerText()
      ).trim()
      if (argsText.length > 0) {
        expect(JSON.parse(inputText)).toEqual(JSON.parse(argsText))
      }

      // Wait for the text response after tool execution (agentic loop's second LLM call)
      await waitForAssistantText(page, 'Fender Stratocaster')
    })

    test('sends the final text after the tool result on the next turn', async ({
      page,
      request,
      testId,
      aimockPort,
    }) => {
      await page.goto(featureUrl(provider, 'tool-calling', testId, aimockPort))

      await sendMessage(page, '[toolcall] what guitars do you have in stock')
      await waitForAssistantText(page, 'Taylor 814ce')

      await sendMessage(page, '[toolcall-followup] which one is the cheapest')
      await waitForAssistantText(page, 'is the cheapest')

      // The follow-up request carries the first turn as history. The final
      // text was written after the tool result, so it must come after it.
      const history = (await readRequestMessages(request, aimockPort, testId))
        .at(-1)!
        .map(({ role, content }) => ({ role, text: textOf(content) }))
      const toolResult = history.findIndex(({ role }) => role === 'tool')
      const finalText = history.findIndex(
        ({ role, text }) =>
          role === 'assistant' && text.includes('Taylor 814ce'),
      )
      expect(toolResult, JSON.stringify(history)).toBeGreaterThan(-1)
      expect(finalText, JSON.stringify(history)).toBeGreaterThan(toolResult)
      expect(history.at(-1)).toMatchObject({
        role: 'user',
        text: '[toolcall-followup] which one is the cheapest',
      })
    })
  })
}

/**
 * The messages of each provider request this test made, oldest first. aimock
 * is shared by every worker and normalises each provider's request to the
 * OpenAI shape, so select this test's entries by their `X-Test-Id` header.
 */
async function readRequestMessages(
  request: APIRequestContext,
  aimockPort: number,
  testId: string,
): Promise<Array<Array<{ role: string; content: unknown }>>> {
  const response = await request.get(
    `http://127.0.0.1:${aimockPort}/v1/_requests`,
  )
  const entries = (await response.json()) as Array<{
    headers?: Record<string, string>
    body: { messages?: Array<{ role: string; content: unknown }> } | null
  }>
  return entries
    .filter((entry) =>
      Object.entries(entry.headers ?? {}).some(
        ([key, value]) => key.toLowerCase() === 'x-test-id' && value === testId,
      ),
    )
    .map((entry) => entry.body?.messages ?? [])
}

function textOf(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .map((part: { text?: unknown }) =>
      typeof part.text === 'string' ? part.text : '',
    )
    .join('')
}
