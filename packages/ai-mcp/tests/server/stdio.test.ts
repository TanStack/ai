import { fileURLToPath } from 'node:url'
import { Client } from '@modelcontextprotocol/client'
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio'
import { OAuthError, OAuthErrorCode } from '@modelcontextprotocol/server'
import { toolDefinition } from '@tanstack/ai'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { createMCPServer } from '../../src/server/create-server'
import type { MCPToolContext } from '../../src/server/context'
import { serveMCPStdio } from '../../src/server/stdio'

const childEnv = 'TANSTACK_AI_MCP_STDIO_CHILD'

function echoTool() {
  return toolDefinition({
    name: 'echo',
    description: 'Echo text',
    inputSchema: z.object({ text: z.string() }),
  }).server(async (args) => args.text)
}

function startChildServer() {
  const server = createMCPServer({
    name: 'weather',
    version: '1.0.0',
    tools: [echoTool()],
  })
  serveMCPStdio(server)
}

if (process.env[childEnv] === '1') {
  startChildServer()
} else if (process.env[childEnv] === 'input') {
  startInputServer()
} else if (process.env[childEnv] === 'flaky-stream') {
  startFlakyStreamServer()
} else if (process.env[childEnv] === 'auth') {
  startAuthServer()
} else {
  describe('serveMCPStdio', () => {
    it('lists and calls the tool for a spec 2025 stdio client', async () => {
      const result = await echoOverStdio('2025')
      expect(result.names).toEqual(['echo'])
      expect(result.content).toEqual([{ type: 'text', text: 'hi' }])
    }, 60000)

    it('lists and calls the tool for a spec 2026 stdio client', async () => {
      const result = await echoOverStdio('2026')
      expect(result.names).toEqual(['echo'])
      expect(result.content).toEqual([{ type: 'text', text: 'hi' }])
    }, 60000)

    it('answers a spec 2025 input request while the tool is still running', async () => {
      const result = await askOverStdio()
      expect(result).toEqual([{ type: 'text', text: 'Paris' }])
    }, 60000)

    it('keeps the answer and opens the spec 2025 stream again after a failed open', async () => {
      const result = await echoOverStdio('2025', 'flaky-stream')
      expect(result.content).toEqual([{ type: 'text', text: 'hi' }])
      expect(result.stderr).toContain('stream open 2')
    }, 60000)

    it('answers with a JSON-RPC error when the server returns an empty 401', async () => {
      // A pinned 2026 client reports any discover failure as a version
      // mismatch. The legacy handshake shows the error text as is.
      await expect(echoOverStdio('2025', 'auth')).rejects.toThrow(/HTTP 401/)
    }, 60000)
  })
}

// Every request gets an empty 401. The host must still get an answer.
function startAuthServer() {
  const server = createMCPServer({
    name: 'weather',
    version: '1.0.0',
    tools: [echoTool()],
    auth: {
      verifier: {
        verifyAccessToken: () =>
          Promise.reject(
            new OAuthError(OAuthErrorCode.InvalidToken, 'Unknown token'),
          ),
      },
    },
  })
  serveMCPStdio(server)
}

// The first GET stream throws. The next message must open a new one.
function startFlakyStreamServer() {
  const server = createMCPServer({
    name: 'weather',
    version: '1.0.0',
    tools: [echoTool()],
  })
  let opens = 0
  serveMCPStdio({
    fetch(request) {
      if (request.method !== 'GET') return server.fetch(request)
      opens += 1
      console.error(`stream open ${opens}`)
      if (opens === 1) return Promise.reject(new Error('stream open failed'))
      return server.fetch(request)
    },
  })
}

function askTool() {
  return toolDefinition({
    name: 'ask',
    description: 'Ask for a city',
    inputSchema: z.object({}),
  }).server<MCPToolContext>(async (_args, ctx) => {
    const answer = await ctx.context.requestInput({ message: 'Which city?' })
    return typeof answer === 'string' ? answer : 'missing'
  })
}

function startInputServer() {
  const server = createMCPServer({
    name: 'weather',
    version: '1.0.0',
    tools: [askTool()],
  })
  serveMCPStdio(server)
}

function clientFor(era: '2025' | '2026') {
  if (era === '2026') {
    return new Client(
      { name: 'tester', version: '1.0.0' },
      { versionNegotiation: { mode: { pin: '2026-07-28' } } },
    )
  }
  return new Client(
    { name: 'tester', version: '1.0.0' },
    { versionNegotiation: { mode: 'legacy' } },
  )
}

async function echoOverStdio(
  era: '2025' | '2026',
  mode: '1' | 'flaky-stream' | 'auth' = '1',
) {
  const testFile = fileURLToPath(import.meta.url)
  const packageRoot = fileURLToPath(new URL('../..', import.meta.url))
  const stderrChunks: Array<string> = []
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ['--import', 'jiti/register', testFile],
    cwd: packageRoot,
    env: { [childEnv]: mode },
    stderr: 'pipe',
  })
  transport.stderr?.on('data', (chunk) => {
    stderrChunks.push(chunkText(chunk))
  })
  const client = clientFor(era)
  try {
    await client.connect(transport)
    const listed = await client.listTools()
    const echoed = await client.callTool({
      name: 'echo',
      arguments: { text: 'hi' },
    })
    return {
      names: listed.tools.map((tool) => tool.name),
      content: echoed.content,
      stderr: stderrChunks.join(''),
    }
  } catch (error) {
    const detail =
      error instanceof Error ? error.message : 'The stdio client failed.'
    throw new Error(`${detail}\n${stderrChunks.join('')}`)
  } finally {
    try {
      await client.close()
    } catch {
      // close rejects when connect did not finish.
    }
  }
}

async function askOverStdio() {
  const testFile = fileURLToPath(import.meta.url)
  const packageRoot = fileURLToPath(new URL('../..', import.meta.url))
  const stderrChunks: Array<string> = []
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ['--import', 'jiti/register', testFile],
    cwd: packageRoot,
    env: { [childEnv]: 'input' },
    stderr: 'pipe',
  })
  transport.stderr?.on('data', (chunk) => {
    stderrChunks.push(chunkText(chunk))
  })
  const client = new Client(
    { name: 'tester', version: '1.0.0' },
    {
      capabilities: { elicitation: { form: {} } },
      versionNegotiation: { mode: 'legacy' },
    },
  )
  client.setRequestHandler('elicitation/create', async () => ({
    action: 'accept',
    content: { value: 'Paris' },
  }))
  try {
    await client.connect(transport)
    const answered = await client.callTool({ name: 'ask', arguments: {} })
    return answered.content
  } catch (error) {
    const detail =
      error instanceof Error ? error.message : 'The stdio client failed.'
    throw new Error(`${detail}\n${stderrChunks.join('')}`)
  } finally {
    try {
      await client.close()
    } catch {
      // close rejects when connect did not finish.
    }
  }
}

function chunkText(chunk: unknown) {
  if (typeof chunk === 'string') return chunk
  if (chunk instanceof Uint8Array) return new TextDecoder().decode(chunk)
  return ''
}
