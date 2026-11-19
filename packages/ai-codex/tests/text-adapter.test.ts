/**
 * Deterministic test of the in-sandbox Codex adapter.
 *
 * Runs a FAKE codex CLI (a node script that reads the prompt from stdin and
 * emits canned `codex exec --experimental-json` JSONL thread events) inside a
 * real local-process sandbox, exercising spawn → stdout NDJSON → translate →
 * StreamChunk. The real `codex` CLI is covered by the gated live path.
 */
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'
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
import type {
  AdapterYieldChunk,
  AnyTool,
  CapabilityContext,
} from '@tanstack/ai'
import type { SandboxHandle } from '@tanstack/ai-sandbox'
import type { CodexTextConfig, CodexTextProviderOptions } from '../src/index'

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
  stream: AsyncIterable<AdapterYieldChunk>,
): Promise<Array<AdapterYieldChunk>> {
  const out: Array<AdapterYieldChunk> = []
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
        threadId: 'thread-1',
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
        threadId: 'thread-1',
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

  it('defaults to danger-full-access on Daytona-like providers', async () => {
    const sbx = await provider.create({})
    await sbx.fs.write('/workspace/fake-codex.mjs', FAKE_CODEX)
    const daytonaHandle: SandboxHandle = { ...sbx, provider: 'daytona' }

    const adapter = codexText('gpt-5.5-codex', {
      codexExecutable: 'node fake-codex.mjs',
    })
    await collect(
      adapter.chatStream({
        threadId: 'thread-1',
        model: 'gpt-5.5-codex',
        messages: [{ role: 'user', content: 'say pong' }],
        logger: noopLogger,
        capabilities: capabilityContextWith(daytonaHandle),
      }),
    )

    const argv = await sbx.fs.read('/workspace/codex-argv.txt')
    expect(argv).toContain('--sandbox danger-full-access')
    expect(argv).not.toContain('--sandbox workspace-write')

    await sbx.destroy()
  })

  it('keeps workspace-write on local-process when no sandboxMode is set', async () => {
    const sbx = await provider.create({})
    await sbx.fs.write('/workspace/fake-codex.mjs', FAKE_CODEX)

    const adapter = codexText('gpt-5.5-codex', {
      codexExecutable: 'node fake-codex.mjs',
    })
    await collect(
      adapter.chatStream({
        threadId: 'thread-1',
        model: 'gpt-5.5-codex',
        messages: [{ role: 'user', content: 'say pong' }],
        logger: noopLogger,
        capabilities: capabilityContextWith(sbx),
      }),
    )

    const argv = await sbx.fs.read('/workspace/codex-argv.txt')
    expect(argv).toContain('--sandbox workspace-write')

    await sbx.destroy()
  })

  it('requires a sandbox capability', async () => {
    const adapter = codexText('gpt-5.5-codex')
    const chunks = await collect(
      adapter.chatStream({
        threadId: 'thread-1',
        model: 'gpt-5.5-codex',
        messages: [{ role: 'user', content: 'hi' }],
        logger: noopLogger,
      }),
    )
    const err = chunks.find((c) => c.type === 'RUN_ERROR')
    expect((err as { message?: string }).message).toMatch(/requires a sandbox/i)
  })

  it('passes --output-schema and emits structured-output.complete', async () => {
    const fake = [
      `import { writeFileSync } from 'node:fs'`,
      `writeFileSync('codex-argv.txt', process.argv.join(' '))`,
      `let input = ''`,
      `process.stdin.on('data', (d) => { input += d })`,
      `process.stdin.on('end', () => {`,
      `  const w = (o) => process.stdout.write(JSON.stringify(o) + '\\n')`,
      `  w({ type: 'thread.started', thread_id: 'th-so' })`,
      `  w({ type: 'turn.started' })`,
      `  w({ type: 'item.completed', item: { id: 'i1', type: 'agent_message', text: '{"ok":true}' } })`,
      `  w({ type: 'turn.completed', usage: { input_tokens: 1, output_tokens: 1 } })`,
      `})`,
    ].join('\n')

    const sbx = await provider.create({})
    await sbx.fs.write('/workspace/fake-codex.mjs', fake)

    const adapter = codexText('gpt-5.5-codex', {
      codexExecutable: 'node fake-codex.mjs',
    })

    const chunks = await collect(
      adapter.chatStream({
        threadId: 'thread-1',
        model: 'gpt-5.5-codex',
        messages: [{ role: 'user', content: 'summarize' }],
        logger: noopLogger,
        capabilities: capabilityContextWith(sbx),
        outputSchema: {
          type: 'object',
          properties: { ok: { type: 'boolean' } },
          required: ['ok'],
        },
      }),
    )

    const argv = await sbx.fs.read('/workspace/codex-argv.txt')
    expect(argv).toContain('--output-schema')

    const complete = chunks.find(
      (c) => c.type === 'CUSTOM' && c.name === 'structured-output.complete',
    )
    expect(complete).toBeDefined()
    if (complete?.type === 'CUSTOM') {
      expect(complete.value).toEqual(
        expect.objectContaining({ object: { ok: true } }),
      )
    }

    await sbx.destroy()
  })
})

// Stand-in for codex that records the API keys it sees and the login file in
// its home (`/workspace/home` in `remoteSandbox`), then answers like
// FAKE_CODEX. A non-zero `exitCode` makes the run fail.
function fakeCodexWithAuth(exitCode: number) {
  return [
    `import { existsSync, readFileSync, writeFileSync } from 'node:fs'`,
    `const keys = { codex: process.env.CODEX_API_KEY ?? null, openai: process.env.OPENAI_API_KEY ?? null }`,
    `writeFileSync('codex-keys.json', JSON.stringify(keys))`,
    `const login = 'home/.codex/auth.json'`,
    `writeFileSync('seen-login.txt', existsSync(login) ? readFileSync(login, 'utf8') : 'none')`,
    `process.stdin.resume()`,
    `process.stdin.on('end', () => {`,
    `  if (${exitCode} !== 0) process.exit(${exitCode})`,
    `  const w = (o) => process.stdout.write(JSON.stringify(o) + '\\n')`,
    `  w({ type: 'thread.started', thread_id: 'th-auth' })`,
    `  w({ type: 'turn.started' })`,
    `  w({ type: 'item.completed', item: { id: 'i1', type: 'agent_message', text: 'pong' } })`,
    `  w({ type: 'turn.completed', usage: { input_tokens: 1, output_tokens: 1 } })`,
    `})`,
  ].join('\n')
}

const LENT_LOGIN = '/workspace/home/.codex/auth.json'

/** A local-process sandbox with the auth-recording fake codex and an API key in its env. */
async function sandboxWithKeys(options: { exitCode: number }) {
  const sbx = await provider.create({})
  await sbx.fs.write(
    '/workspace/fake-codex.mjs',
    fakeCodexWithAuth(options.exitCode),
  )
  await sbx.env.set({ CODEX_API_KEY: 'sk-sandbox' })
  return sbx
}

/**
 * `sbx` as a remote (not local-process) sandbox whose `$HOME` is
 * `/workspace/home`, so the lent login lands inside the test sandbox.
 */
function remoteSandbox(
  sbx: SandboxHandle,
  fs: Partial<SandboxHandle['fs']> = {},
): SandboxHandle {
  return {
    ...sbx,
    provider: 'docker',
    fs: { ...sbx.fs, ...fs },
    process: {
      ...sbx.process,
      exec: (command, options) =>
        sbx.process.exec(command, {
          ...options,
          env: { ...options?.env, HOME: '/workspace/home' },
        }),
    },
  }
}

/** Points CODEX_HOME to a new dir. `login` is the content of its `auth.json`, if any. */
async function stubHostCodexHome(login: string | undefined) {
  await fsp.mkdir(baseDir, { recursive: true })
  const dir = await fsp.mkdtemp(path.join(baseDir, 'codex-home-'))
  if (login !== undefined) {
    await fsp.writeFile(path.join(dir, 'auth.json'), login)
  }
  vi.stubEnv('CODEX_HOME', dir)
}

function runCodex(
  handle: SandboxHandle,
  config: CodexTextConfig,
  modelOptions?: CodexTextProviderOptions,
) {
  const adapter = codexText('gpt-5.5-codex', {
    codexExecutable: 'node fake-codex.mjs',
    env: { OPENAI_API_KEY: 'sk-config' },
    ...config,
  })
  return collect(
    adapter.chatStream({
      threadId: 'thread-1',
      model: 'gpt-5.5-codex',
      messages: [{ role: 'user', content: 'say pong' }],
      logger: noopLogger,
      capabilities: capabilityContextWith(handle),
      ...(modelOptions ? { modelOptions } : {}),
    }),
  )
}

function runError(chunks: Array<AdapterYieldChunk>) {
  const error = chunks.find((c) => c.type === 'RUN_ERROR')
  return error?.type === 'RUN_ERROR' ? error.message : undefined
}

async function readKeys(sbx: SandboxHandle) {
  return JSON.parse(await sbx.fs.read('/workspace/codex-keys.json'))
}

describe('codex authMode', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("'api-key' (default) passes the API keys to codex", async () => {
    const sbx = await sandboxWithKeys({ exitCode: 0 })

    await runCodex(sbx, {})

    expect(await readKeys(sbx)).toEqual({
      codex: 'sk-sandbox',
      openai: 'sk-config',
    })
    await sbx.destroy()
  })

  it("'host' runs codex without CODEX_API_KEY and OPENAI_API_KEY", async () => {
    const sbx = await sandboxWithKeys({ exitCode: 0 })

    const chunks = await runCodex(sbx, { authMode: 'host' })

    expect(await readKeys(sbx)).toEqual({ codex: null, openai: null })
    expect(chunks.some((c) => c.type === 'RUN_FINISHED')).toBe(true)
    await sbx.destroy()
  })

  it('modelOptions.authMode wins over the adapter config', async () => {
    const sbx = await sandboxWithKeys({ exitCode: 0 })

    await runCodex(sbx, { authMode: 'api-key' }, { authMode: 'host' })

    expect(await readKeys(sbx)).toEqual({ codex: null, openai: null })
    await sbx.destroy()
  })

  it("'host' on a remote sandbox lends the host login for the run, then removes it", async () => {
    await stubHostCodexHome('{"tokens":"host"}')
    const sbx = await sandboxWithKeys({ exitCode: 0 })

    const chunks = await runCodex(remoteSandbox(sbx), { authMode: 'host' })

    expect(await sbx.fs.read('/workspace/seen-login.txt')).toBe(
      '{"tokens":"host"}',
    )
    expect(await sbx.fs.exists(LENT_LOGIN)).toBe(false)
    expect(chunks.some((c) => c.type === 'RUN_FINISHED')).toBe(true)
    await sbx.destroy()
  })

  it("'host' removes the lent login when the run fails", async () => {
    await stubHostCodexHome('{"tokens":"host"}')
    const sbx = await sandboxWithKeys({ exitCode: 3 })

    const chunks = await runCodex(remoteSandbox(sbx), { authMode: 'host' })

    expect(runError(chunks)).toMatch(/code 3/)
    expect(await sbx.fs.read('/workspace/seen-login.txt')).toBe(
      '{"tokens":"host"}',
    )
    expect(await sbx.fs.exists(LENT_LOGIN)).toBe(false)
    await sbx.destroy()
  })

  it("'host' with no host login fails before codex starts", async () => {
    await stubHostCodexHome(undefined)
    const sbx = await sandboxWithKeys({ exitCode: 0 })

    const chunks = await runCodex(remoteSandbox(sbx), { authMode: 'host' })

    expect(runError(chunks)).toBe(
      'No Codex login on this machine. Run /connect:codex.',
    )
    expect(await sbx.fs.exists('/workspace/codex-keys.json')).toBe(false)
    await sbx.destroy()
  })

  describe('when the lent login cannot be removed', () => {
    const failingRemove: Partial<SandboxHandle['fs']> = {
      remove: () => Promise.reject(new Error('sandbox is gone')),
    }

    it('keeps the run error of a failed run', async () => {
      await stubHostCodexHome('{"tokens":"host"}')
      const sbx = await sandboxWithKeys({ exitCode: 3 })

      const chunks = await runCodex(remoteSandbox(sbx, failingRemove), {
        authMode: 'host',
      })

      expect(runError(chunks)).toMatch(/code 3/)
      await sbx.destroy()
    })

    it('throws the release error after a good run', async () => {
      await stubHostCodexHome('{"tokens":"host"}')
      const sbx = await sandboxWithKeys({ exitCode: 0 })

      await expect(
        runCodex(remoteSandbox(sbx, failingRemove), { authMode: 'host' }),
      ).rejects.toThrow('sandbox is gone')
      await sbx.destroy()
    })
  })
})
