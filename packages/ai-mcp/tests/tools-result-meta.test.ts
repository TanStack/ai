import { InMemoryTransport } from '@modelcontextprotocol/client'
import { Server } from '@modelcontextprotocol/server'
import { describe, expect, it } from 'vitest'
import { createMCPClientFromTransport } from '../src/client'

// A raw server with one `lookup` tool. Each tools/call returns `result`.
async function makeServerWithResult(result: Record<string, unknown>) {
  const server = new Server(
    { name: 'meta-result', version: '1.0.0' },
    { capabilities: { tools: {} } },
  )
  server.setRequestHandler('tools/list', () => ({
    tools: [{ name: 'lookup', inputSchema: { type: 'object' as const } }],
  }))
  server.setRequestHandler('tools/call', () => ({
    content: [{ type: 'text' as const, text: 'found' }],
    ...result,
  }))
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair()
  await server.connect(serverTransport)
  return clientTransport
}

// Calls the auto-discovered `lookup` tool once. Keeps each value that the
// tool gives to `setResultMetadata`, and the result or the error.
async function callLookup(result: Record<string, unknown>) {
  const clientTransport = await makeServerWithResult(result)
  await using client = await createMCPClientFromTransport(clientTransport)
  const [tool] = await client.tools()
  const metadata: Array<Partial<Record<string, unknown>>> = []
  const outcome = await Promise.resolve(
    tool!.execute!(
      {},
      {
        emitCustomEvent: () => {},
        setResultMetadata: (value) => metadata.push(value),
      },
    ),
  ).then(
    (output: unknown) => ({ output }),
    (error: unknown) => ({ error }),
  )
  return { metadata, outcome }
}

const sources = [{ url: 'https://example.com/a', title: 'A' }]

describe('makeMcpExecute result _meta', () => {
  it('sets every _meta key except tanstack as result metadata', async () => {
    const { metadata, outcome } = await callLookup({
      _meta: { sources, 'io.modelcontextprotocol/x': 1, tanstack: 1 },
    })
    expect(metadata).toEqual([{ sources, 'io.modelcontextprotocol/x': 1 }])
    expect(outcome).toEqual({ output: 'found' })
  })

  it('does not set result metadata when _meta is missing', async () => {
    const { metadata, outcome } = await callLookup({})
    expect(metadata).toEqual([])
    expect(outcome).toEqual({ output: 'found' })
  })

  it('sets result metadata before an isError throw', async () => {
    const { metadata, outcome } = await callLookup({
      isError: true,
      _meta: { sources },
    })
    expect(metadata).toEqual([{ sources }])
    expect(outcome).toEqual({
      error: new Error('MCP tool "lookup" returned an error: found'),
    })
  })
})
