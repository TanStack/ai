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
      taskResult: unknown
      toolMeta: Array<{
        name: string
        title?: string
        annotations?: Record<string, unknown>
      }>
      resources: Array<string>
      prompts: Array<string>
      resourceContent: Array<{ type: string; content: string }>
      promptMessages: Array<{ role: string; content: string }>
    }

    // Tool discovered.
    expect(json.tools).toContain('get_guitar_price')

    // The server's display title + behavior annotations are forwarded onto the
    // discovered tool's `metadata.mcp` — a host can label the tool and shape
    // its approval UI without a second tools/list round-trip.
    const priceMeta = json.toolMeta.find((t) => t.name === 'get_guitar_price')
    expect(priceMeta?.title).toBe('Guitar Price Lookup')
    expect(priceMeta?.annotations).toEqual({
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    })

    // Task-required tools are discovered and execute through MCP's task stream.
    expect(json.tools).toContain('appraise_guitar_collection')
    expect(JSON.stringify(json.taskResult)).toContain('4200')
    expect(JSON.stringify(json.taskResult)).toContain('strat')

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

test.describe('mcp — task execution error paths', () => {
  test('aborts a hanging task-required tool without waiting for a result', async ({
    request,
  }) => {
    const res = await request.get('/api/mcp-task-errors?scenario=abort')
    const body = await res.text()
    expect(
      res.ok(),
      `mcp-task-errors abort failed (${res.status()}): ${body}`,
    ).toBe(true)
    const json = JSON.parse(body) as {
      aborted: boolean
      elapsedMs: number
      errorName: string
      message: string
    }
    expect(json.aborted).toBe(true)
    expect(json.elapsedMs).toBeLessThan(5000)
    expect(json.message).not.toContain('4200')
    expect(json.errorName).not.toBe('none')
  })

  test('skips a task-required tool when the server has no tasks capability', async ({
    request,
  }) => {
    const res = await request.get(
      '/api/mcp-task-errors?scenario=skip-unsupported',
    )
    const body = await res.text()
    expect(
      res.ok(),
      `mcp-task-errors skip-unsupported failed (${res.status()}): ${body}`,
    ).toBe(true)
    const json = JSON.parse(body) as { tools: Array<string> }
    expect(json.tools).toEqual(['plain_tool'])
  })

  test('callTool throws MCPTaskRequiredToolError without the tasks capability', async ({
    request,
  }) => {
    const res = await request.get(
      '/api/mcp-task-errors?scenario=call-unsupported',
    )
    const body = await res.text()
    expect(
      res.ok(),
      `mcp-task-errors call-unsupported failed (${res.status()}): ${body}`,
    ).toBe(true)
    const json = JSON.parse(body) as {
      errorName: string
      isTaskRequired: boolean
    }
    expect(json.errorName).toBe('MCPTaskRequiredToolError')
    expect(json.isTaskRequired).toBe(true)
  })

  test('tools([defs]) throws MCPTaskRequiredToolError without the tasks capability', async ({
    request,
  }) => {
    const res = await request.get(
      '/api/mcp-task-errors?scenario=bind-unsupported',
    )
    const body = await res.text()
    expect(
      res.ok(),
      `mcp-task-errors bind-unsupported failed (${res.status()}): ${body}`,
    ).toBe(true)
    const json = JSON.parse(body) as {
      errorName: string
      isTaskRequired: boolean
    }
    expect(json.errorName).toBe('MCPTaskRequiredToolError')
    expect(json.isTaskRequired).toBe(true)
  })
})
