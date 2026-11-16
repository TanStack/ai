import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { toolDefinition } from '@tanstack/ai'
import { OAuthError, createMCPServer } from '@tanstack/ai-mcp/server'
import { createQuickJSIsolateDriver } from '@tanstack/ai-isolate-quickjs'
import { hashSnippet, sandboxedTool } from '../src/index'
import type { AuthInfo, OAuthTokenVerifier } from '@tanstack/ai-mcp/server'
import type { Facades, Manifest } from '../src/index'

/**
 * The migration bridge from the design note: a custom OAuthTokenVerifier over a
 * hashed-token table (home-mcp's existing auth) so v1 tokens keep working under
 * createMCPServer's native OAuth. clientId + scopes land on ctx.context.authInfo,
 * which the sandboxed tool's per-tool scope gate reads.
 */
function hashedTokenVerifier(
  table: Record<string, { clientId: string; scopes: Array<string> }>,
): OAuthTokenVerifier {
  return {
    async verifyAccessToken(token: string): Promise<AuthInfo> {
      const record = table[createHash('sha256').update(token).digest('hex')]
      if (!record) throw new OAuthError('invalid_token', 'Unknown token')
      return {
        token,
        clientId: record.clientId,
        scopes: record.scopes,
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
        extra: {},
      }
    },
  }
}

const driver = createQuickJSIsolateDriver()
const snippet = `return { ok: input.n * 2 }`

const manifest: Manifest = {
  name: 'double',
  version: '1.0.0',
  tier: 1,
  scope: 'math:read',
  inject: [],
  limits: {
    wallClockMs: 2000,
    memoryMb: 32,
    maxInjectedCalls: 0,
    resultBytes: 1024,
  },
  truncatable: [],
  inputSchema: { type: 'object', properties: { n: { type: 'number' } } },
  description: 'Double a number in a sandbox',
  snippetHash: hashSnippet(snippet),
}

const facades: Facades = {}

describe('createMCPServer integration', () => {
  it('bridges a hashed-token table to AuthInfo with scopes', async () => {
    const token = 'secret-token'
    const verifier = hashedTokenVerifier({
      [createHash('sha256').update(token).digest('hex')]: {
        clientId: 'home-client',
        scopes: ['math:read'],
      },
    })

    const info = await verifier.verifyAccessToken(token)
    expect(info).toMatchObject({
      clientId: 'home-client',
      scopes: ['math:read'],
    })
    await expect(verifier.verifyAccessToken('wrong')).rejects.toBeInstanceOf(
      OAuthError,
    )
  })

  it('composes a sandboxed tool and a plain tool in one server', () => {
    const sandboxed = sandboxedTool({ manifest, snippet, facades, driver })
    const plain = toolDefinition({
      name: 'ping',
      description: 'trusted in-process tool',
      inputSchema: { type: 'object' },
    }).server(async () => 'pong')

    const server = createMCPServer({
      name: 'mixed',
      version: '1.0.0',
      auth: {
        verifier: hashedTokenVerifier({}),
      },
      tools: [sandboxed, plain],
    })

    expect(server.tools.map((t) => t.name).sort()).toEqual(['double', 'ping'])
    expect(typeof server.fetch).toBe('function')
  })
})
