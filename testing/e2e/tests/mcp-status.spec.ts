import { test, expect } from './fixtures'

/**
 * MCP resource + prompt read/convert path, end-to-end against the in-process
 * Streamable-HTTP MCP server (`api.mcp-server`).
 *
 * `api.mcp-status-test` connects via `@tanstack/ai-mcp`, lists + reads the
 * server's tools/resources/prompts, and converts resources/prompts through the
 * public `mcpResourceToContentPart` / `mcpPromptToMessages` helpers. This proves
 * the manual-integration building blocks (resources(), readResource(),
 * prompts(), getPrompt() + converters) work against a real server — the unit
 * tests only cover the converters in isolation. No LLM is involved.
 */
test.describe('mcp — resource/prompt discovery + conversion', () => {
  test('lists and converts the server tools, resources, and prompts', async ({
    request,
  }) => {
    const res = await request.get('/api/mcp-status-test')
    const body = await res.text()
    expect(
      res.ok(),
      `mcp-status-test route failed (${res.status()}): ${body}`,
    ).toBe(true)

    const json = JSON.parse(body) as {
      tools: Array<string>
      resources: Array<string>
      prompts: Array<string>
      resourceContent: Array<{ type: string; content: string }>
      promptMessages: Array<{ role: string; content: string }>
    }

    // Tool discovered.
    expect(json.tools).toContain('get_guitar_price')

    // Task-required tool (execution.taskSupport: 'required') is excluded from
    // discovery — plain callTool can never execute it (-32600).
    expect(json.tools).not.toContain('appraise_guitar_collection')

    // Resource listed + read + converted to a text ContentPart carrying the
    // server's distinctive token.
    expect(json.resources).toContain('guitar://catalog')
    const resourceText = json.resourceContent.map((c) => c.content).join('\n')
    expect(resourceText).toContain('STRAT-001')

    // Prompt listed + fetched + converted to ModelMessages.
    expect(json.prompts).toContain('recommend_guitar')
    expect(json.promptMessages.length).toBeGreaterThan(0)
    const promptText = json.promptMessages.map((m) => m.content).join('\n')
    expect(promptText.toLowerCase()).toContain('guitar')
  })
})
