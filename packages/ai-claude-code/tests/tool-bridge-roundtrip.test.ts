/**
 * End-to-end proof of the CO-LOCATED ("combined") host-tool delegation path.
 *
 * In the co-located model the harness loop AND its MCP tool-bridge run INSIDE
 * the container (the in-container sandbox is just `local-process`). The bridge
 * does NOT serve the real `chat()` tools — it serves `remoteToolStubs(...)`
 * whose `execute()` delegates back to the orchestrator via `executeHostTool`.
 * The ONLY thing that crosses the container→orchestrator boundary is that one
 * host-tool execution.
 *
 * This test wires that whole path with real parts:
 *   in-sandbox fake agent
 *     → reads the injected `--mcp-config` (bridge url + bearer token)
 *     → POSTs a JSON-RPC `tools/call` to the in-container localhost bridge
 *   bridge (createToolBridgeCore over remoteToolStubs)
 *     → stub.execute → RemoteToolExecutor
 *       → executeHostTool([getFactRealTool], …)  ← the host hop
 *         → the REAL tool's execute() returns a known value
 *   → value travels back through the bridge response into the agent
 *   → the agent emits it as its final stream-json result
 *
 * The assertion checks the host tool's known value made the full round trip
 * into the translated event stream — and that the real tool actually ran.
 */
import { createServer } from 'node:http'
import * as fsp from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterAll, describe, expect, it, vi } from 'vitest'
import { localProcessSandbox } from '@tanstack/ai-sandbox-local-process'
import {
  SandboxCapability,
  ToolBridgeProvisionerCapability,
  createToolBridgeCore,
  executeHostTool,
  handleBridgeJsonRpc,
  remoteToolStubs,
  timingSafeBearerEqual,
  toolDescriptors,
} from '@tanstack/ai-sandbox'
import { claudeCodeText } from '../src/index'
import type { AddressInfo } from 'node:net'
import type { InternalLogger } from '@tanstack/ai/adapter-internals'
import type { AnyTool, CapabilityContext, StreamChunk } from '@tanstack/ai'
import type {
  ProvisionedBridge,
  SandboxHandle,
  ToolBridgeProvisioner,
} from '@tanstack/ai-sandbox'

const baseDir = path.join(os.tmpdir(), `tanstack-ai-cc-bridge-test-${Date.now()}`)
const provider = localProcessSandbox({ baseDir, removeOnDestroy: true })

afterAll(async () => {
  await fsp.rm(baseDir, { recursive: true, force: true })
})

// A `claude` stand-in that GENUINELY exercises the tool bridge: it reads the
// prompt from stdin, parses `--mcp-config <file>` from argv, reads the bridge
// url + bearer token, performs one JSON-RPC `tools/call` for `get_fact`, then
// emits the bridge's returned text as its final stream-json result.
const FAKE_CLAUDE_TOOL_CALL = [
  `import { readFileSync } from 'node:fs'`,
  `let input = ''`,
  `process.stdin.on('data', (d) => { input += d })`,
  `process.stdin.on('end', async () => {`,
  `  const w = (o) => process.stdout.write(JSON.stringify(o) + '\\n')`,
  `  w({ type: 'system', subtype: 'init', session_id: 'sess-bridge', model: 'haiku', tools: [] })`,
  `  const i = process.argv.indexOf('--mcp-config')`,
  // The adapter writes the bridge config to the workspace root and passes its
  // virtual `/workspace/...` path. A real container's cwd IS /workspace; the
  // local-process sandbox maps /workspace to its real cwd, so read by basename.
  `  const cfgPath = process.argv[i + 1].replace(/^.*\\//, '')`,
  `  const cfg = JSON.parse(readFileSync(cfgPath, 'utf8'))`,
  `  const server = cfg.mcpServers.tanstack`,
  `  const res = await fetch(server.url, {`,
  `    method: 'POST',`,
  `    headers: { 'content-type': 'application/json', ...server.headers },`,
  `    body: JSON.stringify({`,
  `      jsonrpc: '2.0', id: 1, method: 'tools/call',`,
  `      params: { name: 'get_fact', arguments: { topic: 'sandbox' } },`,
  `    }),`,
  `  })`,
  `  const body = await res.json()`,
  `  const text = body.result.content[0].text`,
  `  w({ type: 'assistant', message: { id: 'msg-1', content: [{ type: 'text', text }] }, parent_tool_use_id: null })`,
  `  w({ type: 'result', subtype: 'success', result: text, usage: { input_tokens: 1, output_tokens: 1 } })`,
  `})`,
].join('\n')

const noopLogger = {
  request: () => {},
  provider: () => {},
  errors: () => {},
  agentLoop: () => {},
  warnings: () => {},
  debug: () => {},
} as unknown as InternalLogger

/**
 * A `ToolBridgeProvisioner` standing in for the IN-CONTAINER localhost bridge:
 * it serves the transport-agnostic bridge core over a plain `node:http`
 * JSON-RPC endpoint (no MCP framing needed for the fake), loopback-bound and
 * bearer-gated, exactly like the co-located model's in-container bridge.
 */
function inContainerBridgeProvisioner(): ToolBridgeProvisioner {
  return {
    async provision(tools, options) {
      const token = 'test-bridge-token'
      const { provider: _provider, ...coreOptions } = options
      const core = createToolBridgeCore(tools, coreOptions)
      const httpServer = createServer((req, res) => {
        void (async () => {
          if (!timingSafeBearerEqual(req.headers['authorization'], token)) {
            res.writeHead(401).end('unauthorized')
            return
          }
          let raw = ''
          for await (const chunk of req) raw += chunk
          const response = await handleBridgeJsonRpc(core, JSON.parse(raw))
          res.writeHead(200, { 'content-type': 'application/json' })
          res.end(JSON.stringify(response))
        })().catch((error: unknown) => {
          if (!res.headersSent) res.writeHead(500).end(String(error))
        })
      })
      await new Promise<void>((resolve) =>
        httpServer.listen(0, '127.0.0.1', resolve),
      )
      const port = (httpServer.address() as AddressInfo).port
      const bridge: ProvisionedBridge = {
        name: 'tanstack',
        url: `http://127.0.0.1:${port}/mcp`,
        token,
        close: () =>
          new Promise<void>((resolve) => httpServer.close(() => resolve())),
      }
      return bridge
    },
  }
}

/** Capability context handing the adapter the sandbox + the in-container bridge. */
function capabilityContextWith(
  handle: SandboxHandle,
  provisioner: ToolBridgeProvisioner,
): CapabilityContext {
  const [, provideSandbox] = SandboxCapability
  const [, provideProvisioner] = ToolBridgeProvisionerCapability
  const ctx = {
    capabilities: { markProvided: () => {}, has: () => true },
  } as unknown as CapabilityContext
  provideSandbox(ctx, handle)
  provideProvisioner(ctx, provisioner)
  return ctx
}

async function collect(
  stream: AsyncIterable<StreamChunk>,
): Promise<Array<StreamChunk>> {
  const out: Array<StreamChunk> = []
  for await (const chunk of stream) out.push(chunk)
  return out
}

describe('claude-code co-located host-tool delegation', () => {
  it('round-trips a host tool: agent → in-container bridge → stub → executeHostTool → real tool', async () => {
    // The REAL host tool: its execute() lives in the orchestrator (DB/secrets/
    // app state in production). Spied so we can assert it actually ran.
    const execute = vi.fn(
      (args: unknown) =>
        `FACT[${(args as { topic: string }).topic}]=host-only-value`,
    )
    const getFactRealTool: AnyTool = {
      name: 'get_fact',
      description: 'Return a known fact for a topic.',
      inputSchema: {
        type: 'object',
        properties: { topic: { type: 'string' } },
        required: ['topic'],
      },
      execute,
    }

    const sbx = await provider.create({})
    await sbx.fs.write('/workspace/fake-claude.mjs', FAKE_CLAUDE_TOOL_CALL)

    const adapter = claudeCodeText('haiku', {
      claudeExecutable: 'node fake-claude.mjs',
      streamPartials: false,
      emitDiff: false,
    })

    const chunks = await collect(
      adapter.chatStream({
        model: 'haiku',
        messages: [{ role: 'user', content: 'use the get_fact tool' }],
        logger: noopLogger,
        capabilities: capabilityContextWith(sbx, inContainerBridgeProvisioner()),
        // Container side: rebuild chat()'s tools as stubs whose execute()
        // delegates to the orchestrator's executeHostTool. The bridge serves
        // these stubs — only this executor crosses back to the host tool.
        tools: remoteToolStubs(toolDescriptors([getFactRealTool]), {
          execute: (name, args) =>
            executeHostTool([getFactRealTool], name, args),
        }),
      }),
    )

    // The run completed cleanly.
    expect(chunks.some((c) => c.type === 'RUN_ERROR')).toBe(false)
    expect(chunks.some((c) => c.type === 'RUN_FINISHED')).toBe(true)

    // The REAL host tool actually executed, with the agent's args (and the
    // run context/signal executeHostTool forwards as the second argument).
    expect(execute).toHaveBeenCalledTimes(1)
    expect(execute.mock.calls[0]?.[0]).toEqual({ topic: 'sandbox' })

    // Its known value made the full round trip back into the stream.
    const text = chunks
      .filter((c) => c.type === 'TEXT_MESSAGE_CONTENT')
      .map((c) => (c as { delta?: string }).delta ?? '')
      .join('')
    expect(text).toContain('FACT[sandbox]=host-only-value')

    await sbx.destroy()
  })
})
