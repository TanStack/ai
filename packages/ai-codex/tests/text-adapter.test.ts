/**
 * Deterministic test of the in-sandbox Codex adapter.
 *
 * Runs a FAKE codex CLI (a node script that reads the prompt from stdin and
 * emits canned `codex exec --experimental-json` JSONL thread events) inside a
 * real local-process sandbox, exercising spawn → stdout NDJSON → translate →
 * StreamChunk. The real `codex` CLI is covered by the gated live path.
 */
import { afterAll, describe, expect, it } from 'vitest'
import * as fsp from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { localProcessSandbox } from '@tanstack/ai-sandbox-local-process'
import {
  SandboxCapability,
  provideToolBridgeProvisioner,
} from '@tanstack/ai-sandbox'
import { codexText } from '../src/index'
import type { InternalLogger } from '@tanstack/ai/adapter-internals'
import type { AnyTool, CapabilityContext, StreamChunk } from '@tanstack/ai'
import type { SandboxHandle } from '@tanstack/ai-sandbox'

const baseDir = path.join(os.tmpdir(), `tanstack-ai-codex-test-${Date.now()}`)
const provider = localProcessSandbox({ baseDir, removeOnDestroy: true })

afterAll(async () => {
  await fsp.rm(baseDir, { recursive: true, force: true })
})

// Stand-in for `codex exec --experimental-json`: records the argv it was spawned
// with (so a test can assert the generated CLI flags), reads the prompt from
// stdin, and emits codex thread-event JSONL.
const FAKE_CODEX = [
  `import { writeFileSync } from 'node:fs'`,
  `writeFileSync('codex-argv.txt', process.argv.join(' '))`,
  `let input = ''`,
  `process.stdin.on('data', (d) => { input += d })`,
  `process.stdin.on('end', () => {`,
  `  const w = (o) => process.stdout.write(JSON.stringify(o) + '\\n')`,
  `  w({ type: 'thread.started', thread_id: 'th-1' })`,
  `  w({ type: 'turn.started' })`,
  `  w({ type: 'item.completed', item: { id: 'i1', type: 'agent_message', text: 'pong' } })`,
  `  w({ type: 'turn.completed', usage: { input_tokens: 1, output_tokens: 1 } })`,
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

function capabilityContextWith(handle: SandboxHandle): CapabilityContext {
  const [, provideSandbox] = SandboxCapability
  const ctx = {
    capabilities: { markProvided: () => {}, has: () => true },
  } as unknown as CapabilityContext
  provideSandbox(ctx, handle)
  return ctx
}

async function collect(
  stream: AsyncIterable<StreamChunk>,
): Promise<Array<StreamChunk>> {
  const out: Array<StreamChunk> = []
  for await (const chunk of stream) out.push(chunk)
  return out
}

describe('codex in-sandbox adapter', () => {
  it('spawns codex in the sandbox and streams translated events', async () => {
    const sbx = await provider.create({})
    await sbx.fs.write('/workspace/fake-codex.mjs', FAKE_CODEX)

    const adapter = codexText('gpt-5.5-codex', {
      codexExecutable: 'node fake-codex.mjs',
    })

    const chunks = await collect(
      adapter.chatStream({
        model: 'gpt-5.5-codex',
        messages: [{ role: 'user', content: 'say pong' }],
        logger: noopLogger,
        capabilities: capabilityContextWith(sbx),
      }),
    )

    expect((chunks[0] as { type: string }).type).toBe('RUN_STARTED')
    const text = chunks
      .filter((c) => c.type === 'TEXT_MESSAGE_CONTENT')
      .map((c) => (c as { delta?: string }).delta ?? '')
      .join('')
    expect(text).toContain('pong')
    expect(chunks.some((c) => c.type === 'RUN_FINISHED')).toBe(true)
    await sbx.destroy()
  })

  it('bridges chat() tools via http_headers, not the streamable-http-rejected bearer_token', async () => {
    // Codex's streamable-HTTP MCP transport REJECTS inline `bearer_token`
    // ("bearer_token is not supported for streamable_http"); the per-run bearer
    // must ride an `Authorization` header instead. Stub the provisioner so the
    // bridge url/token are deterministic, then assert the generated CLI flags.
    const sbx = await provider.create({})
    await sbx.fs.write('/workspace/fake-codex.mjs', FAKE_CODEX)

    const ctx = capabilityContextWith(sbx)
    provideToolBridgeProvisioner(ctx, {
      provision: () =>
        Promise.resolve({
          name: 'tanstack',
          url: 'http://bridge.test/_bridge/run1',
          token: 'secret-token-xyz',
          close: () => Promise.resolve(),
        }),
    })

    const adapter = codexText('gpt-5.5-codex', {
      codexExecutable: 'node fake-codex.mjs',
    })
    await collect(
      adapter.chatStream({
        model: 'gpt-5.5-codex',
        messages: [{ role: 'user', content: 'use a tool' }],
        logger: noopLogger,
        capabilities: ctx,
        // Non-empty tools array activates the bridge path; the stub provisioner
        // ignores the contents, so a placeholder is enough.
        tools: [{ name: 'demo' } as unknown as AnyTool],
      }),
    )

    const argv = await sbx.fs.read('/workspace/codex-argv.txt')
    expect(argv).toContain(
      'mcp_servers.tanstack.url="http://bridge.test/_bridge/run1"',
    )
    expect(argv).toContain(
      'mcp_servers.tanstack.http_headers={ "Authorization" = "Bearer secret-token-xyz" }',
    )
    expect(argv).not.toContain('bearer_token')
    await sbx.destroy()
  })

  it('requires a sandbox capability', async () => {
    const adapter = codexText('gpt-5.5-codex')
    const chunks = await collect(
      adapter.chatStream({
        model: 'gpt-5.5-codex',
        messages: [{ role: 'user', content: 'hi' }],
        logger: noopLogger,
      }),
    )
    const err = chunks.find((c) => c.type === 'RUN_ERROR')
    expect((err as { message?: string }).message).toMatch(/requires a sandbox/i)
  })
})
