/**
 * Deterministic test of the in-sandbox Claude Code adapter.
 *
 * Instead of the real `claude` CLI (nondeterministic, needs an API key — see
 * the gated live smoke in testing/e2e), this runs a FAKE agent CLI: a tiny node
 * script that reads the prompt from stdin and emits canned `stream-json`
 * messages on stdout, exactly as `claude -p --output-format stream-json` would.
 * It runs inside a real local-process sandbox, exercising the full
 * spawn → stdout NDJSON → translate → StreamChunk path.
 */
import { afterAll, describe, expect, it } from 'vitest'
import * as fsp from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { localProcessSandbox } from '@tanstack/ai-sandbox-local-process'
import { SandboxCapability } from '@tanstack/ai-sandbox'
import { claudeCodeText } from '../src/index'
import type { InternalLogger } from '@tanstack/ai/adapter-internals'
import type { CapabilityContext, StreamChunk } from '@tanstack/ai'
import type { SandboxHandle } from '@tanstack/ai-sandbox'

const baseDir = path.join(os.tmpdir(), `tanstack-ai-cc-test-${Date.now()}`)
const provider = localProcessSandbox({ baseDir, removeOnDestroy: true })

afterAll(async () => {
  await fsp.rm(baseDir, { recursive: true, force: true })
})

// A stand-in for the `claude` CLI: ignores its flags, reads the prompt from
// stdin, then emits stream-json (system/init → assistant text → result).
const FAKE_CLAUDE = [
  `let input = ''`,
  `process.stdin.on('data', (d) => { input += d })`,
  `process.stdin.on('end', () => {`,
  `  const w = (o) => process.stdout.write(JSON.stringify(o) + '\\n')`,
  `  w({ type: 'system', subtype: 'init', session_id: 'sess-abc', model: 'haiku', tools: [] })`,
  `  w({ type: 'assistant', message: { id: 'msg-1', content: [{ type: 'text', text: 'pong' }] }, parent_tool_use_id: null })`,
  `  w({ type: 'result', subtype: 'success', result: 'pong', usage: { input_tokens: 1, output_tokens: 1 } })`,
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

/** Build a capability context that hands the adapter the given sandbox. */
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

describe('claude-code in-sandbox adapter', () => {
  it('spawns the agent CLI in the sandbox and streams translated events', async () => {
    const sbx = await provider.create({})
    await sbx.fs.write('/workspace/fake-claude.mjs', FAKE_CLAUDE)

    const adapter = claudeCodeText('haiku', {
      // Relative executable + cwd=/workspace (mapped to the sandbox root).
      claudeExecutable: 'node fake-claude.mjs',
      streamPartials: false,
      emitDiff: false,
    })

    const chunks = await collect(
      adapter.chatStream({
        model: 'haiku',
        messages: [{ role: 'user', content: 'say pong' }],
        logger: noopLogger,
        capabilities: capabilityContextWith(sbx),
      }),
    )

    const types = chunks.map((c) => c.type as string)
    expect(types[0]).toBe('RUN_STARTED')

    const sessionEvent = chunks.find(
      (c) =>
        c.type === 'CUSTOM' &&
        (c as { name?: string }).name === 'claude-code.session-id',
    )
    expect(sessionEvent).toBeDefined()
    expect(
      (sessionEvent as { value: { sessionId: string } }).value.sessionId,
    ).toBe('sess-abc')

    const text = chunks
      .filter((c) => c.type === 'TEXT_MESSAGE_CONTENT')
      .map((c) => (c as { delta?: string }).delta ?? '')
      .join('')
    expect(text).toContain('pong')

    expect(chunks.some((c) => c.type === 'RUN_FINISHED')).toBe(true)

    await sbx.destroy()
  })

  it('requires a sandbox capability', async () => {
    const adapter = claudeCodeText('haiku', { emitDiff: false })
    const chunks = await collect(
      adapter.chatStream({
        model: 'haiku',
        messages: [{ role: 'user', content: 'hi' }],
        logger: noopLogger,
        // no capabilities provided
      }),
    )
    const err = chunks.find((c) => c.type === 'RUN_ERROR')
    expect(err).toBeDefined()
    expect((err as { message?: string }).message).toMatch(/requires a sandbox/i)
  })

  it('rejects chat()-provided tools (MCP tool-proxy pending)', async () => {
    const sbx = await provider.create({})
    const adapter = claudeCodeText('haiku', { emitDiff: false })
    const chunks = await collect(
      adapter.chatStream({
        model: 'haiku',
        messages: [{ role: 'user', content: 'hi' }],
        logger: noopLogger,
        capabilities: capabilityContextWith(sbx),
        tools: [
          {
            name: 'getTime',
            description: 'x',
            execute: () => Promise.resolve('now'),
          } as never,
        ],
      }),
    )
    const err = chunks.find((c) => c.type === 'RUN_ERROR')
    expect((err as { message?: string }).message).toMatch(
      /does not yet bridge/i,
    )
    await sbx.destroy()
  })
})
