import { expect, test } from '@playwright/test'

/**
 * `chat({ mcp })` host-completeness: attachResources, prompts, maxTools.
 *
 * Route: `api.mcp-context-test` — real in-process MCP server + synthetic
 * adapter. Middleware captures the merged messages and tool budget before
 * the model call.
 */
test.describe('mcp-context — chat({ mcp }) attachResources / prompts / maxTools', () => {
  test('attaches the catalog resource, prepends the prompt, and caps tools', async ({
    request,
  }) => {
    const res = await request.post('/api/mcp-context-test')
    const body = await res.text()
    expect(
      res.ok(),
      `mcp-context-test failed (${res.status()}): ${body}`,
    ).toBe(true)

    const json = JSON.parse(body) as {
      messageText: string
      toolNames: Array<string>
    }

    // attachResources: catalog text reaches the model messages.
    expect(json.messageText).toContain('STRAT-001')
    // prompts: recommend_guitar content is prepended.
    expect(json.messageText.toLowerCase()).toContain('beginner-friendly')
    // maxTools: 1 — LazyToolManager advertises the kept MCP tool + the
    // discovery tool; overflow MCP tools are withheld until discovered.
    const DISCOVERY = '__lazy__tool__discovery__'
    expect(json.toolNames).toEqual(
      expect.arrayContaining(['get_guitar_price', DISCOVERY]),
    )
    expect(json.toolNames).toHaveLength(2)
    expect(json.toolNames).not.toContain('appraise_guitar_collection')
    expect(json.toolNames).not.toContain('hanging_appraisal')
  })
})
