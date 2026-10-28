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
  })
}
