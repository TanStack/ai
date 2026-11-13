import { describe, expect, it } from 'vitest'
import { InMemoryTransport } from '@modelcontextprotocol/client'
import { McpServer } from '@modelcontextprotocol/server'
import { createMCPClientFromTransport } from '@tanstack/ai-mcp'
import { z } from 'zod'
import { optimize } from './optimize'
import { at, must, runConfig, stubConfig, stubCtx } from './test-helpers'
import type { ModelMessage } from '@tanstack/ai'

const ctx = stubCtx()
const bigLog = 'L'.repeat(8000)

async function mcpToolsOverInMemory() {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  const server = new McpServer({ name: 'logs', version: '1.0.0' })
  server.registerTool(
    'read_logs',
    { description: 'Read a service log', inputSchema: z.object({ service: z.string() }) },
    async ({ service }) => ({ content: [{ type: 'text' as const, text: `${service}: ${bigLog}` }] }),
  )
  await server.connect(serverTransport)
  const client = await createMCPClientFromTransport(clientTransport)
  return { tools: await client.tools(), client }
}

describe('optimize() over MCP tools (InMemoryTransport)', () => {
  it('wraps MCP-sourced ServerTools and projects their results end-to-end', async () => {
    const { tools, client } = await mcpToolsOverInMemory()
    expect(tools.map((t) => t.name)).toContain('read_logs')

    const events: Array<unknown> = []
    const opt = optimize(tools, {
      defaults: { truncate: { strategy: 'head_tail', aboveTokens: 1500, maxTokens: 750 }, mode: 'flatten' },
      onEvent: (e) => events.push(e),
    })
    // MCP wrapping appends the retrieval tool.
    expect(opt.tools.map((t) => t.name)).toContain('retrieve_context')

    // A conversation turn where the MCP tool was called and returned a big log.
    const messages: Array<ModelMessage> = [
      {
        role: 'assistant',
        content: '',
        toolCalls: [{ id: 'c1', type: 'function', function: { name: 'read_logs', arguments: '{"service":"api"}' } }],
      },
      { role: 'tool', toolCallId: 'c1', name: 'read_logs', content: `api: ${bigLog}` },
    ]
    const out = must(runConfig(opt.middleware, ctx, stubConfig(messages, opt.tools)))

    expect(at(out.providerMessages, 1).content).toMatch(/^\[Truncated for context: \$,/)
    // Canonical message untouched.
    expect(at(messages, 1).content).toBe(`api: ${bigLog}`)
    expect(events).toHaveLength(1)

    await client.close?.()
  })
})
