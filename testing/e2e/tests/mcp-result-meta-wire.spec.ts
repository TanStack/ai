import { expect, test } from './fixtures'
import { sendMessage, waitForAssistantText, waitForResponse } from './helpers'

/**
 * MCP result `_meta` reaches the page. `/api/mcp-result-meta-wire` runs
 * `chat()` with a fake model and an in-process MCP server. The server's
 * `search_docs` result has `_meta.sources`, and the page shows them from
 * `part.resultMetadata`.
 */
test.describe('mcp: result _meta on the wire', () => {
  test('the page shows the sources from the MCP result _meta', async ({
    page,
    testId,
  }) => {
    await page.goto(
      `/tool-result-metadata?mode=mcp&testId=${encodeURIComponent(testId)}`,
    )
    await expect(page.getByTestId('hydration-marker')).toBeAttached()

    await sendMessage(page, 'find the lighthouse docs')
    await waitForAssistantText(page, 'MCP_RESULT_META_OK')
    await waitForResponse(page)

    const source = page.getByTestId('result-source')
    await expect(source).toHaveText(['MCP lighthouse guide'])
    await expect(source.getByRole('link')).toHaveAttribute(
      'href',
      'https://mcp.example.com/lighthouse',
    )
  })
})
