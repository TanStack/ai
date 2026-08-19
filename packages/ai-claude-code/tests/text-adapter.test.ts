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
import type { AdapterYieldChunk, CapabilityContext } from '@tanstack/ai'
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
  // Echo IS_SANDBOX so the test can assert local-process does not set it.
  `  w({ type: 'assistant', message: { id: 'msg-1', content: [{ type: 'text', text: 'pong IS_SANDBOX=' + process.env.IS_SANDBOX }] }, parent_tool_use_id: null })`,
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
  stream: AsyncIterable<AdapterYieldChunk>,
): Promise<Array<AdapterYieldChunk>> {
  const out: Array<AdapterYieldChunk> = []
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
    // Isolated sandboxes set IS_SANDBOX=1. local-process must not.
    expect(text).toContain('IS_SANDBOX=undefined')

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

  it('bridges chat()-provided tools (starts + tears down the MCP bridge)', async () => {
    const sbx = await provider.create({})
    await sbx.fs.write('/workspace/fake-claude.mjs', FAKE_CLAUDE)
    const adapter = claudeCodeText('haiku', {
      claudeExecutable: 'node fake-claude.mjs',
      streamPartials: false,
      emitDiff: false,
    })
    // The fake claude ignores the injected --mcp-config; this checks that
    // passing tools no longer errors and the bridge lifecycle is clean.
    const chunks = await collect(
      adapter.chatStream({
        model: 'haiku',
        messages: [{ role: 'user', content: 'say pong' }],
        logger: noopLogger,
        capabilities: capabilityContextWith(sbx),
        tools: [
          {
            name: 'getTime',
            description: 'x',
            inputSchema: { type: 'object', properties: {} },
            execute: () => Promise.resolve('now'),
          } as never,
        ],
      }),
    )
    expect(chunks.some((c) => c.type === 'RUN_ERROR')).toBe(false)
    expect(chunks.some((c) => c.type === 'RUN_FINISHED')).toBe(true)
    await sbx.destroy()
  })

  it('passes --json-schema and emits structured-output.complete', async () => {
    const fake = [
      `import { writeFileSync } from 'node:fs'`,
      `writeFileSync('argv.txt', process.argv.slice(2).join(' '))`,
      `let input = ''`,
      `process.stdin.on('data', (d) => { input += d })`,
      `process.stdin.on('end', () => {`,
      `  const w = (o) => process.stdout.write(JSON.stringify(o) + '\\n')`,
      `  w({ type: 'system', subtype: 'init', session_id: 'sess-so', model: 'haiku', tools: [] })`,
      `  w({ type: 'assistant', message: { id: 'msg-1', content: [{ type: 'text', text: 'looking' }] }, parent_tool_use_id: null })`,
      `  w({ type: 'result', subtype: 'success', result: 'done', structured_output: { summary: 'ok' }, usage: { input_tokens: 1, output_tokens: 1 } })`,
      `})`,
    ].join('\n')

    const sbx = await provider.create({})
    await sbx.fs.write('/workspace/fake-claude.mjs', fake)

    const adapter = claudeCodeText('haiku', {
      claudeExecutable: 'node fake-claude.mjs',
      streamPartials: false,
      emitDiff: false,
      settingSources: ['project', 'local'],
    })

    const chunks = await collect(
      adapter.chatStream({
        model: 'haiku',
        messages: [{ role: 'user', content: 'summarize' }],
        logger: noopLogger,
        capabilities: capabilityContextWith(sbx),
        outputSchema: {
          type: 'object',
          properties: { summary: { type: 'string' } },
          required: ['summary'],
        },
      }),
    )

    const argv = await sbx.fs.read('/workspace/argv.txt')
    expect(argv).not.toContain('--bare')
    expect(argv).toContain('--setting-sources')
    expect(argv).toContain('project,local')
    expect(argv).toContain('--json-schema')
    expect(argv).toContain('"type":"object"')
    expect(argv).toContain('"summary"')
    expect(argv).not.toContain('tanstack-output-schema')
    expect(argv).not.toMatch(/--json-schema\s+\./)

    const complete = chunks.find(
      (c) => c.type === 'CUSTOM' && c.name === 'structured-output.complete',
    )
    expect(complete).toBeDefined()
    if (complete?.type === 'CUSTOM') {
      expect(complete.value).toEqual(
        expect.objectContaining({ object: { summary: 'ok' } }),
      )
    }

    await sbx.destroy()
  })

  it('uses user as the default setting source', async () => {
    const fake = [
      `import { writeFileSync } from 'node:fs'`,
      `writeFileSync('argv.txt', process.argv.slice(2).join(' '))`,
      `let input = ''`,
      `process.stdin.on('data', (d) => { input += d })`,
      `process.stdin.on('end', () => {`,
      `  const w = (o) => process.stdout.write(JSON.stringify(o) + '\\n')`,
      `  w({ type: 'system', subtype: 'init', session_id: 'sess-default', model: 'haiku', tools: [] })`,
      `  w({ type: 'result', subtype: 'success', result: 'ok', usage: { input_tokens: 1, output_tokens: 1 } })`,
      `})`,
    ].join('\n')
    const sbx = await provider.create({})
    await sbx.fs.write('/workspace/fake-claude.mjs', fake)

    try {
      const adapter = claudeCodeText('haiku', {
        claudeExecutable: 'node fake-claude.mjs',
        streamPartials: false,
        emitDiff: false,
      })
      await collect(
        adapter.chatStream({
          model: 'haiku',
          messages: [{ role: 'user', content: 'hi' }],
          logger: noopLogger,
          capabilities: capabilityContextWith(sbx),
        }),
      )

      expect(await sbx.fs.read('/workspace/argv.txt')).toMatch(
        /--setting-sources user/,
      )
    } finally {
      await sbx.destroy()
    }
  })

  it('copies ANTHROPIC_API_KEY from the host process into the CLI env', async () => {
    const fake = [
      `import { writeFileSync } from 'node:fs'`,
      `writeFileSync('auth-probe.txt', process.env.ANTHROPIC_API_KEY ? 'set' : 'missing')`,
      `let input = ''`,
      `process.stdin.on('data', (d) => { input += d })`,
      `process.stdin.on('end', () => {`,
      `  const w = (o) => process.stdout.write(JSON.stringify(o) + '\\n')`,
      `  w({ type: 'system', subtype: 'init', session_id: 'sess-auth', model: 'haiku', tools: [] })`,
      `  w({ type: 'assistant', message: { id: 'msg-1', content: [{ type: 'text', text: 'ok' }] }, parent_tool_use_id: null })`,
      `  w({ type: 'result', subtype: 'success', result: 'ok', usage: { input_tokens: 1, output_tokens: 1 } })`,
      `})`,
    ].join('\n')

    const previous = process.env.ANTHROPIC_API_KEY
    process.env.ANTHROPIC_API_KEY = 'sk-test-not-a-real-key'
    const sbx = await provider.create({})
    try {
      await sbx.fs.write('/workspace/fake-claude.mjs', fake)
      const adapter = claudeCodeText('haiku', {
        claudeExecutable: 'node fake-claude.mjs',
        streamPartials: false,
        emitDiff: false,
      })
      const chunks = await collect(
        adapter.chatStream({
          model: 'haiku',
          messages: [{ role: 'user', content: 'hi' }],
          logger: noopLogger,
          capabilities: capabilityContextWith(sbx),
        }),
      )
      expect(chunks.some((c) => c.type === 'RUN_ERROR')).toBe(false)
      expect(await sbx.fs.read('/workspace/auth-probe.txt')).toBe('set')
    } finally {
      if (previous === undefined) delete process.env.ANTHROPIC_API_KEY
      else process.env.ANTHROPIC_API_KEY = previous
      await sbx.destroy()
    }
  })
})
