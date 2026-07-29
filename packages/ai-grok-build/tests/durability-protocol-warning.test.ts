/**
 * `chatStreamAcp` never journals (only `chatStreamNdjson` does — see
 * `attach.test.ts`'s header comment), but `protocol` defaults to `'acp'`. So an
 * app that wires `withSandbox({ runs, durability })` and leaves `protocol`
 * unset gets a run that looks durable — it streams normally and records a run
 * row — while being silently unrecoverable: there is no journal to replay on
 * reconnect.
 *
 * This is a WARN, not a throw (see the comment above the check in
 * `chatStreamAcp`, matching the precedent in
 * `packages/ai-sandbox/src/middleware.ts`'s `InMemoryLockStore` warning): an
 * app can legitimately wire durability once at the middleware level and still
 * choose `protocol: 'acp'` for runs it deliberately never needs to recover.
 *
 * These tests drive `chatStreamAcp` for real — a fake ACP agent (the actual
 * `@agentclientprotocol/sdk` agent side) spawned over stdio inside a real
 * `localProcessSandbox`, exactly like `packages/ai-acp/tests/compatible.test.ts`
 * — because the warn check sits inline in `chatStreamAcp`'s setup, ahead of
 * spawning the connection, so exercising the full path is what proves the
 * check fires (or doesn't) on the actual code path the fix touches, not a
 * hand-extracted copy of its condition.
 */
import { afterAll, describe, expect, it, vi } from 'vitest'
import * as fsp from 'node:fs/promises'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { localProcessSandbox } from '@tanstack/ai-sandbox-local-process'
import {
  SandboxCapability,
  SandboxDurabilityCapability,
} from '@tanstack/ai-sandbox'
import { InMemoryRunStore } from '@tanstack/ai'
import { grokBuildText } from '../src/index'
import type { InternalLogger } from '@tanstack/ai/adapter-internals'
import type { CapabilityContext, StreamChunk } from '@tanstack/ai'
import type { SandboxHandle, SandboxRunDurability } from '@tanstack/ai-sandbox'
import type { StreamDurability } from '@tanstack/ai'

/**
 * Locate the real `@agentclientprotocol/sdk` install through `@tanstack/ai-acp`'s
 * own `node_modules` rather than resolving it directly: `ai-grok-build` does not
 * (and should not) depend on the ACP SDK itself, only on `@tanstack/ai-acp`,
 * which does. `require.resolve` can't cross that boundary because the SDK isn't
 * declared in this package's own dependency graph under pnpm's strict
 * resolution, so this walks the filesystem instead of module resolution.
 */
function resolveAcpSdkEntryUrl(): string {
  const testDir = path.dirname(fileURLToPath(import.meta.url))
  const sdkDir = fs.realpathSync(
    path.join(
      testDir,
      '..',
      'node_modules',
      '@tanstack',
      'ai-acp',
      'node_modules',
      '@agentclientprotocol',
      'sdk',
    ),
  )
  const pkg = JSON.parse(
    fs.readFileSync(path.join(sdkDir, 'package.json'), 'utf8'),
  ) as { exports?: { '.'?: { import?: string } }; main?: string }
  const entry = pkg.exports?.['.']?.import ?? pkg.main
  if (entry === undefined) {
    throw new Error('could not resolve @agentclientprotocol/sdk entry point')
  }
  return pathToFileURL(path.join(sdkDir, entry)).href
}

const SDK_URL = resolveAcpSdkEntryUrl()

/** A minimal native `streaming-json` harness, as `chatStreamNdjson` expects on stdout. */
const NDJSON_FAKE_GROK = [
  `const w = (s) => process.stdout.write(s + '\\n')`,
  `w('{"type":"text","data":"pong"}')`,
  `w('{"type":"end","stopReason":"EndTurn","sessionId":"sess-1"}')`,
].join('\n')

/** A minimal ACP agent that replies "pong" and reports the SDK's protocol version. */
const FAKE_GROK_ACP_AGENT = `
import { AgentSideConnection, ndJsonStream, PROTOCOL_VERSION } from ${JSON.stringify(SDK_URL)}
import { Readable, Writable } from 'node:stream'

const input = Readable.toWeb(process.stdin)
const output = Writable.toWeb(process.stdout)
const stream = ndJsonStream(output, input)

new AgentSideConnection((conn) => ({
  async initialize() {
    return {
      protocolVersion: PROTOCOL_VERSION,
      agentCapabilities: { loadSession: true },
      // 'grok.com' matches \`resolveGrokAcpAuthMethod\`'s fallback when no
      // XAI_API_KEY/GROK_API_KEY env is set, so the real handshake picks it.
      authMethods: [{ id: 'grok.com', name: 'grok.com', description: null }],
    }
  },
  async authenticate() {
    return {}
  },
  async newSession() {
    return { sessionId: 'sess-1' }
  },
  async loadSession() {
    return {}
  },
  async prompt(params) {
    await conn.sessionUpdate({
      sessionId: params.sessionId,
      update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'pong' } },
    })
    return { stopReason: 'end_turn' }
  },
  async cancel() {},
}), stream)
`

const baseDir = path.join(
  os.tmpdir(),
  `tanstack-ai-grok-build-durability-warn-${Date.now()}`,
)
// No removeOnDestroy: destroying a sandbox right after killing its agent races
// the OS releasing the dir (EBUSY on Windows) — see compatible.test.ts.
const provider = localProcessSandbox({ baseDir })

afterAll(async () => {
  const sbx = await provider.create({})
  await sbx.process.exec(`rm -rf '${JOURNAL_DIR}'`)
  await sbx.destroy()
  await fsp.rm(baseDir, {
    recursive: true,
    force: true,
    maxRetries: 10,
    retryDelay: 100,
  })
})

function noopLogger(): InternalLogger & { warn: ReturnType<typeof vi.fn> } {
  return {
    request: () => {},
    provider: () => {},
    errors: () => {},
    agentLoop: () => {},
    warnings: () => {},
    debug: () => {},
    warn: vi.fn(),
  } as unknown as InternalLogger & { warn: ReturnType<typeof vi.fn> }
}

/** A `StreamDurability` whose methods are never expected to be exercised on the ACP path. */
function fakeAdapterLog(): StreamDurability {
  return {
    resumeFrom: () => null,
    append: (chunks) => Promise.resolve(chunks.map((_, i) => `o:${i}`)),
    read: () => (async function* empty() {})(),
    close: () => Promise.resolve(),
    snapshot: () => Promise.resolve([]),
  }
}

/**
 * A journal directory scoped to this file's run. Real (not `/tmp/unused`),
 * because the `streaming-json` case below actually journals through it — see
 * `attach.test.ts` for why `/tmp/...` and not the sandbox's own dir.
 */
const JOURNAL_DIR = `/tmp/tanstack-grok-durability-warn-${Date.now()}`

function durability(): SandboxRunDurability {
  return {
    runs: new InMemoryRunStore(),
    adapter: fakeAdapterLog(),
    journalDir: JOURNAL_DIR,
    attach: false,
    detachOnDisconnect: true,
    detachedRunTtlMs: 60_000,
  }
}

function contextWith(
  handle: SandboxHandle,
  durabilityCapability?: SandboxRunDurability,
): CapabilityContext {
  const [, provideSandbox] = SandboxCapability
  const [, provideSandboxDurability] = SandboxDurabilityCapability
  const ctx = {
    capabilities: { markProvided: () => {}, has: () => true },
  } as unknown as CapabilityContext
  provideSandbox(ctx, handle)
  if (durabilityCapability) provideSandboxDurability(ctx, durabilityCapability)
  return ctx
}

async function collect(
  stream: AsyncIterable<StreamChunk>,
): Promise<Array<StreamChunk>> {
  const out: Array<StreamChunk> = []
  for await (const chunk of stream) out.push(chunk)
  return out
}

function textOf(chunks: Array<StreamChunk>): string {
  return chunks
    .filter((c) => c.type === 'TEXT_MESSAGE_CONTENT')
    .map((c) => (c as { delta?: string }).delta ?? '')
    .join('')
}

function adapter() {
  // No `protocol` set: this is what exercises `chatStreamAcp`, since
  // `protocol` defaults to `'acp'` — the exact silent-misconfiguration
  // scenario, an app that wires durability without ever choosing a protocol.
  return grokBuildText('grok-build', {
    grokExecutable: 'node fake-grok-acp-agent.mjs',
    emitDiff: false,
  })
}

const SANDBOX_TEST_TIMEOUT = 60_000

describe(
  'grok-build durability + ACP protocol misconfiguration warning',
  { timeout: SANDBOX_TEST_TIMEOUT },
  () => {
    it('warns exactly once, naming the consequence and the fix, when durability is configured on the ACP (default) protocol', async () => {
      const sbx = await provider.create({})
      await sbx.fs.write(
        '/workspace/fake-grok-acp-agent.mjs',
        FAKE_GROK_ACP_AGENT,
      )
      const logger = noopLogger()

      const chunks = await collect(
        adapter().chatStream({
          model: 'grok-build',
          messages: [{ role: 'user', content: 'say pong' }],
          logger,
          capabilities: contextWith(sbx, durability()),
        }),
      )

      // The warn does not alter the ACP path's emitted chunk sequence.
      expect(chunks[0]).toMatchObject({ type: 'RUN_STARTED' })
      expect(textOf(chunks)).toBe('pong')
      expect(chunks.some((c) => c.type === 'RUN_FINISHED')).toBe(true)

      expect(logger.warn).toHaveBeenCalledTimes(1)
      const [message] = logger.warn.mock.calls[0] as [string]
      expect(message).toMatch(/not be recoverable/i)
      expect(message).toContain("protocol: 'streaming-json'")

      await sbx.destroy()
    })

    it('does NOT warn when durability is configured with protocol: streaming-json', async () => {
      const sbx = await provider.create({})
      await sbx.fs.write('/workspace/fake-grok-ndjson.mjs', NDJSON_FAKE_GROK)
      const logger = noopLogger()

      const journalingAdapter = grokBuildText('grok-build', {
        grokExecutable: 'node fake-grok-ndjson.mjs',
        protocol: 'streaming-json',
        emitDiff: false,
      })

      const chunks = await collect(
        journalingAdapter.chatStream({
          model: 'grok-build',
          // The journaling (`chatStreamNdjson`) path requires a caller-supplied
          // `runId` once durability is wired — `resolveDurableRunId` throws
          // `DurableRunIdRequiredError` otherwise (see `attach.test.ts`). That
          // is a different, already-covered diagnostic; supply one here so
          // this test isolates the warning behavior under test.
          runId: 'r-streaming-json-warn-check',
          messages: [{ role: 'user', content: 'say pong' }],
          logger,
          capabilities: contextWith(sbx, durability()),
        }),
      )

      // This IS the journaled path, so confirm the run actually completed
      // rather than the absence of a warning being a side effect of an
      // early failure.
      expect(textOf(chunks)).toBe('pong')
      expect(chunks.some((c) => c.type === 'RUN_FINISHED')).toBe(true)
      expect(logger.warn).not.toHaveBeenCalled()

      await sbx.destroy()
    })

    it('does NOT warn on the common default: no durability wired, ACP protocol', async () => {
      const sbx = await provider.create({})
      await sbx.fs.write(
        '/workspace/fake-grok-acp-agent.mjs',
        FAKE_GROK_ACP_AGENT,
      )
      const logger = noopLogger()

      const chunks = await collect(
        adapter().chatStream({
          model: 'grok-build',
          messages: [{ role: 'user', content: 'say pong' }],
          logger,
          capabilities: contextWith(sbx),
        }),
      )

      expect(textOf(chunks)).toBe('pong')
      expect(logger.warn).not.toHaveBeenCalled()

      await sbx.destroy()
    })
  },
)
