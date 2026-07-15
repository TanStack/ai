/**
 * Unit tests for the transport-agnostic bridge pieces (no `node:http`, no MCP
 * client): the JSON-RPC dispatcher's branches, the permission-resolver path of
 * the core, and the constant-time bearer check.
 */
import { describe, expect, it } from 'vitest'
import {
  createToolBridgeCore,
  handleBridgeJsonRpc,
  timingSafeBearerEqual,
} from '../src/tool-bridge'
import type { AnyTool } from '@tanstack/ai'

function tool(name: string, execute: (args: unknown) => unknown): AnyTool {
  return {
    name,
    description: `${name} tool`,
    inputSchema: { type: 'object', properties: {} },
    execute,
  } as unknown as AnyTool
}

/** Narrow a JSON-RPC reply for assertions without `any`. */
function rpc(value: unknown): {
  id?: unknown
  result?: {
    tools?: Array<{ name: string }>
    content?: unknown
    isError?: boolean
  }
  error?: { code: number; message: string }
} {
  if (value === null || typeof value !== 'object') throw new Error('not rpc')
  return value
}

describe('handleBridgeJsonRpc', () => {
  const core = createToolBridgeCore([
    tool('echo', (args) => ({ echoed: args })),
  ])

  it('returns -32600 for a non-object message', async () => {
    expect(rpc(await handleBridgeJsonRpc(core, null)).error?.code).toBe(-32600)
    expect(rpc(await handleBridgeJsonRpc(core, 42)).error?.code).toBe(-32600)
  })

  it('answers initialize', async () => {
    const reply = rpc(
      await handleBridgeJsonRpc(core, { id: 1, method: 'initialize' }),
    )
    expect(reply.id).toBe(1)
    expect(reply.error).toBeUndefined()
  })

  it('returns null for notifications/initialized (no id)', async () => {
    expect(
      await handleBridgeJsonRpc(core, { method: 'notifications/initialized' }),
    ).toBeNull()
  })

  it('lists tools', async () => {
    const reply = rpc(
      await handleBridgeJsonRpc(core, { id: 2, method: 'tools/list' }),
    )
    expect(reply.result?.tools?.map((t) => t.name)).toEqual(['echo'])
  })

  it('returns -32602 for tools/call with a non-string name', async () => {
    const reply = rpc(
      await handleBridgeJsonRpc(core, {
        id: 3,
        method: 'tools/call',
        params: { name: 42 },
      }),
    )
    expect(reply.error?.code).toBe(-32602)
  })

  it('dispatches a valid tools/call', async () => {
    const reply = rpc(
      await handleBridgeJsonRpc(core, {
        id: 4,
        method: 'tools/call',
        params: { name: 'echo', arguments: { a: 1 } },
      }),
    )
    expect(reply.error).toBeUndefined()
    expect(reply.result?.content).toBeDefined()
  })

  it('returns -32601 for an unknown method', async () => {
    const reply = rpc(
      await handleBridgeJsonRpc(core, { id: 5, method: 'nope' }),
    )
    expect(reply.error?.code).toBe(-32601)
  })
})

describe('createToolBridgeCore', () => {
  it('returns an isError result when a tool throws (never rejects)', async () => {
    const core = createToolBridgeCore([
      tool('boom', () => {
        throw new Error('kaboom')
      }),
    ])
    const result = await core.callTool('boom', {})
    expect(result.isError).toBe(true)
    expect(result.content[0]?.text).toContain('kaboom')
  })

  it('throws for an unknown tool', async () => {
    const core = createToolBridgeCore([])
    await expect(core.callTool('ghost', {})).rejects.toThrow(/Unknown tool/)
  })

  it('advertises + resolves the permission tool', async () => {
    const core = createToolBridgeCore([], {
      permission: {
        toolName: 'approval_prompt',
        resolve: () => ({ behavior: 'allow' }),
      },
    })
    expect(core.listTools().map((t) => t.name)).toContain('approval_prompt')
    const result = await core.callTool('approval_prompt', { tool_name: 'Bash' })
    expect(result.content[0]?.text).toContain('allow')
  })
})

describe('timingSafeBearerEqual', () => {
  it('accepts the exact header, rejects wrong/short/missing', () => {
    expect(timingSafeBearerEqual('Bearer tok-123456', 'tok-123456')).toBe(true)
    expect(timingSafeBearerEqual('Bearer aaaaaaaaaa', 'bbbbbbbbbb')).toBe(false)
    expect(timingSafeBearerEqual('Bearer short', 'longer-token')).toBe(false)
    expect(timingSafeBearerEqual(undefined, 'tok')).toBe(false)
    expect(timingSafeBearerEqual('tok', 'tok')).toBe(false) // no scheme
  })
})
