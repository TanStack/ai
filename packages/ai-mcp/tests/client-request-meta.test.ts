import { InMemoryTransport } from '@modelcontextprotocol/client'
import { Server } from '@modelcontextprotocol/server'
import { describe, expect, it } from 'vitest'
import { createMCPClientFromTransport } from '../src/client'
import { requestMetaParams } from '../src/tools'
import { makeServerWithTaskRequiredTool } from './helpers/in-memory-server'
import type { JSONRPCMessage } from '@modelcontextprotocol/client'

// A raw server that answers tools/call, resources/read, and prompts/get.
// It keeps the `_meta` of the last request for each method.
async function makeMetaRecordingServer() {
  const seen = new Map<string, unknown>()
  const server = new Server(
    { name: 'meta', version: '1.0.0' },
    { capabilities: { tools: {}, resources: {}, prompts: {} } },
  )
  server.setRequestHandler('tools/list', () => ({
    tools: [{ name: 'echo', inputSchema: { type: 'object' as const } }],
  }))
  server.setRequestHandler('tools/call', (request) => {
    seen.set('tools/call', request.params._meta)
    return { content: [{ type: 'text' as const, text: 'ok' }] }
  })
  server.setRequestHandler('resources/read', (request) => {
    seen.set('resources/read', request.params._meta)
    return { contents: [{ uri: request.params.uri, text: 'ok' }] }
  })
  server.setRequestHandler('prompts/get', (request) => {
    seen.set('prompts/get', request.params._meta)
    return { messages: [] }
  })
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair()
  await server.connect(serverTransport)
  return { clientTransport, seen }
}

// Keeps every message the client sends, so a test can read the wire params.
function recordSent(transport: InMemoryTransport) {
  const sent: Array<JSONRPCMessage> = []
  const send = transport.send.bind(transport)
  transport.send = (message, options) => {
    sent.push(message)
    return send(message, options)
  }
  return sent
}

function sentParams(sent: Array<JSONRPCMessage>, method: string) {
  const message = sent.find(
    (entry) => 'method' in entry && entry.method === method,
  )
  return message !== undefined && 'params' in message
    ? message.params
    : undefined
}

const meta = { 'acme.com/tenant': 't1', traceId: 'abc' }

describe('per-call request meta', () => {
  it('callTool sends meta as params._meta', async () => {
    const { clientTransport, seen } = await makeMetaRecordingServer()
    await using client = await createMCPClientFromTransport(clientTransport)
    await client.callTool('echo', {}, { meta })
    expect(seen.get('tools/call')).toMatchObject(meta)
  })

  it('readResource sends meta', async () => {
    const { clientTransport, seen } = await makeMetaRecordingServer()
    await using client = await createMCPClientFromTransport(clientTransport)
    await client.readResource('file:///a', { meta })
    expect(seen.get('resources/read')).toMatchObject(meta)
  })

  it('getPrompt sends meta', async () => {
    const { clientTransport, seen } = await makeMetaRecordingServer()
    await using client = await createMCPClientFromTransport(clientTransport)
    await client.getPrompt('p', undefined, { meta })
    expect(seen.get('prompts/get')).toMatchObject(meta)
  })

  // Read on the wire: the server SDK lifts envelope keys out of `_meta`
  // before a handler runs, so a handler cannot see them.
  it('drops reserved keys', async () => {
    const { clientTransport } = await makeMetaRecordingServer()
    const sent = recordSent(clientTransport)
    await using client = await createMCPClientFromTransport(clientTransport)
    await client.callTool(
      'echo',
      {},
      {
        meta: {
          progressToken: 9,
          'io.modelcontextprotocol/protocolVersion': 'x',
          'mcp.dev/a': 1,
          'api.modelcontextprotocol.org/b': 4,
          'acme.com/mcp-thing': 2,
          'mcp/x': 3,
          tenant: 't',
        },
      },
    )
    const received = sentParams(sent, 'tools/call')?._meta
    expect(received).toMatchObject({
      'acme.com/mcp-thing': 2,
      'mcp/x': 3,
      tenant: 't',
    })
    expect(received).not.toHaveProperty(['mcp.dev/a'])
    expect(received).not.toHaveProperty(['api.modelcontextprotocol.org/b'])
    expect(received).not.toHaveProperty(
      ['io.modelcontextprotocol/protocolVersion'],
      'x',
    )
    expect(received).not.toHaveProperty('progressToken', 9)
  })

  it('sends no user keys without meta', async () => {
    const { clientTransport, seen } = await makeMetaRecordingServer()
    await using client = await createMCPClientFromTransport(clientTransport)
    await client.callTool('echo', {})
    await client.readResource('file:///a')
    await client.getPrompt('p')
    // The SDK may add its own keys. None of the test keys may appear.
    for (const method of ['tools/call', 'resources/read', 'prompts/get']) {
      expect(seen.get(method) ?? {}).not.toHaveProperty('tenant')
      expect(seen.get(method) ?? {}).not.toHaveProperty(['acme.com/tenant'])
    }
  })

  it('task-required tool sends meta on the task tools/call', async () => {
    const { clientTransport } = await makeServerWithTaskRequiredTool()
    const sent = recordSent(clientTransport)
    await using client = await createMCPClientFromTransport(clientTransport)
    const result = await client.callTool(
      'research_task',
      { query: 'q' },
      { meta },
    )
    expect(result.content).toEqual([
      { type: 'text', text: 'Research complete: q' },
    ])
    expect(sentParams(sent, 'tools/call')).toMatchObject({
      name: 'research_task',
      task: {},
      _meta: meta,
    })
  })
})

describe('requestMetaParams', () => {
  it.each([
    ['undefined', undefined],
    ['null', null],
    ['an array', []],
    ['an empty object', {}],
    ['only reserved keys', { progressToken: 1 }],
  ])('gives no _meta for %s', (_label, input) => {
    expect(requestMetaParams(input)).toEqual({})
  })
})
