/**
 * `compatible.ts` never journals: it drives the harness over a bidirectional ACP
 * connection and has no `spawnNdjson`, no journal to tail, no
 * `awaitAttachableJournal` to refuse a hopeless attach up front, and no
 * `alignedIfAttaching` to suppress an already-delivered prefix. So an app that
 * wires `withSandbox({ runs, durability })` and routes runs through this adapter
 * gets something that LOOKS durable while being unrecoverable.
 *
 * The response splits on whether a first attempt has already run, and the
 * asymmetry is the whole design:
 *
 * - A FRESH durable run only fails to be recoverable LATER. An app may knowingly
 *   accept that (durability is wired once at the middleware level, and not every
 *   run needs to survive a restart). That is a WARN — audible, not fatal — once
 *   per run.
 * - An ATTACH has already spent its first attempt: `sandboxRunDriver`'s `drive()`
 *   sets `attach: true` only when a previous host was streaming this run.
 *   Proceeding re-runs the agent from scratch against the workspace that attempt
 *   mutated and double-appends its whole output to a log that still holds the
 *   first attempt's. That is a THROW —
 *   `DurableAttachNotSupportedError`, raised before the ACP connection opens.
 *
 * These tests drive `chatStream` for real — the actual `@agentclientprotocol/sdk`
 * agent side spawned over stdio in a real `localProcessSandbox`, as in
 * `compatible.test.ts` — because both checks sit inline in `chatStream`'s setup
 * ahead of the spawn, so exercising the real path is what proves they fire (or
 * don't) where the fix lives, not a hand-extracted copy of their condition.
 */
import { afterAll, describe, expect, it, vi } from 'vitest'
import * as fsp from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { localProcessSandbox } from '@tanstack/ai-sandbox-local-process'
import {
  SandboxCapability,
  SandboxDurabilityCapability,
} from '@tanstack/ai-sandbox'
import { InMemoryRunStore } from '@tanstack/ai'
import { acpCompatible } from '../src/index'
import type { InternalLogger } from '@tanstack/ai/adapter-internals'
import type {
  CapabilityContext,
  AdapterYieldChunk,
  StreamDurability,
} from '@tanstack/ai'
import type { SandboxHandle, SandboxRunDurability } from '@tanstack/ai-sandbox'

const require = createRequire(import.meta.url)
const SDK_URL = pathToFileURL(require.resolve('@agentclientprotocol/sdk')).href

/** A minimal ACP agent that replies "pong" — the only output this file looks for. */
const FAKE_ACP_AGENT = `
import { AgentSideConnection, ndJsonStream, PROTOCOL_VERSION } from ${JSON.stringify(SDK_URL)}
import { Readable, Writable } from 'node:stream'

const input = Readable.toWeb(process.stdin)
const output = Writable.toWeb(process.stdout)
const stream = ndJsonStream(output, input)

new AgentSideConnection((conn) => ({
  async initialize() {
    return { protocolVersion: PROTOCOL_VERSION, agentCapabilities: { loadSession: true }, authMethods: [] }
  },
  async authenticate() { return {} },
  async newSession() { return { sessionId: 'sess-1' } },
  async loadSession() { return {} },
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
  `tanstack-ai-acp-durability-attach-${Date.now()}`,
)
// No removeOnDestroy: destroying a sandbox right after killing its agent races
// the OS releasing the dir (EBUSY on Windows) — see compatible.test.ts.
const provider = localProcessSandbox({ baseDir })

afterAll(async () => {
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

/**
 * A `StreamDurability` whose methods are never expected to be exercised: this
 * adapter does not journal, which is the very condition under test. If a case
 * here ever started appending through it, that would be the bug.
 */
function fakeAdapterLog(): StreamDurability {
  return {
    resumeFrom: () => null,
    append: (chunks) => Promise.resolve(chunks.map((_, i) => `o:${i}`)),
    read: () => (async function* empty() {})(),
    close: () => Promise.resolve(),
    snapshot: () => Promise.resolve([]),
  }
}

function durability(attach = false): SandboxRunDurability {
  return {
    runs: new InMemoryRunStore(),
    adapter: fakeAdapterLog(),
    journalDir: `/tmp/tanstack-acp-attach-unused-${Date.now()}`,
    attach,
    detachOnDisconnect: true,
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
  stream: AsyncIterable<AdapterYieldChunk>,
): Promise<Array<AdapterYieldChunk>> {
  const out: Array<AdapterYieldChunk> = []
  for await (const chunk of stream) out.push(chunk)
  return out
}

function textOf(chunks: Array<AdapterYieldChunk>): string {
  return chunks
    .filter((c) => c.type === 'TEXT_MESSAGE_CONTENT')
    .map((c) => (c as { delta?: string }).delta ?? '')
    .join('')
}

function adapter() {
  return acpCompatible({
    name: 'pi',
    command: () => 'node fake-acp-agent.mjs',
  })('pi-fast')
}

const SANDBOX_TEST_TIMEOUT = 60_000

describe(
  'acp durability on a never-journaling adapter',
  { timeout: SANDBOX_TEST_TIMEOUT },
  () => {
    it('REFUSES an attach outright, instead of re-running the agent', async () => {
      const sbx = await provider.create({})
      await sbx.fs.write('/workspace/fake-acp-agent.mjs', FAKE_ACP_AGENT)
      const logger = noopLogger()

      const chunks = await collect(
        adapter().chatStream({
          model: 'pi-fast',
          runId: 'r-attach-refused',
          messages: [{ role: 'user', content: 'say pong' }],
          logger,
          capabilities: contextWith(sbx, durability(true)),
        }),
      )

      // The adapter's `catch` turns any throw into a RUN_ERROR chunk, so assert
      // on that rather than on a rejection.
      expect(chunks).toHaveLength(1)
      const error = chunks[0] as { type: string; message?: string }
      expect(error.type).toBe('RUN_ERROR')
      expect(error.message).toContain('cannot ATTACH')

      // The refusal must state the CONSEQUENCE, not merely the condition — that
      // is what makes it actionable rather than something an operator retries.
      expect(error.message).toMatch(/re-run the agent from scratch/i)
      expect(error.message).toMatch(/double-append/i)
      // And it must rule the retry out explicitly, because the neighbouring
      // `JournalAttachUnavailableError` IS retryable and would otherwise be the
      // natural reading.
      expect(error.message).toMatch(/not a transient condition/i)

      // THE POINT OF THE THROW: the agent never ran. `pong` is the fake agent's
      // only output, so its absence proves `session.prompt(...)` was never
      // reached — the workspace the previous attempt mutated was not re-driven
      // and nothing was appended to the run log.
      expect(textOf(chunks)).toBe('')
      expect(chunks.some((c) => c.type === 'RUN_STARTED')).toBe(false)

      // A refusal, not the warn escalated: warning here would mean it proceeded.
      expect(logger.warn).not.toHaveBeenCalled()

      await sbx.destroy()
    })

    it('warns exactly once and PROCEEDS on a fresh durable run', async () => {
      const sbx = await provider.create({})
      await sbx.fs.write('/workspace/fake-acp-agent.mjs', FAKE_ACP_AGENT)
      const logger = noopLogger()

      const chunks = await collect(
        adapter().chatStream({
          model: 'pi-fast',
          runId: 'r-fresh-durable',
          messages: [{ role: 'user', content: 'say pong' }],
          logger,
          capabilities: contextWith(sbx, durability(false)),
        }),
      )

      // Proceeding is half the assertion: a fresh durable run is NOT refused.
      expect(chunks[0]).toMatchObject({ type: 'RUN_STARTED' })
      expect(textOf(chunks)).toContain('pong')
      expect(chunks.some((c) => c.type === 'RUN_FINISHED')).toBe(true)

      // Once per run, not per chunk — a per-chunk warning would be worse than
      // none, so the count is the assertion, not just that it fired.
      expect(logger.warn).toHaveBeenCalledTimes(1)
      const [message] = logger.warn.mock.calls[0] as [string]
      expect(message).toMatch(/not be recoverable/i)
      // It must name a fix, or it is only noise.
      expect(message).toMatch(/journaling harness adapter/i)

      await sbx.destroy()
    })

    it('is byte-identical to today when no durability is wired', async () => {
      const sbx = await provider.create({})
      await sbx.fs.write('/workspace/fake-acp-agent.mjs', FAKE_ACP_AGENT)
      const logger = noopLogger()

      const chunks = await collect(
        adapter().chatStream({
          model: 'pi-fast',
          runId: 'r-no-durability',
          messages: [{ role: 'user', content: 'say pong' }],
          logger,
          capabilities: contextWith(sbx),
        }),
      )

      expect(chunks[0]).toMatchObject({ type: 'RUN_STARTED' })
      expect(textOf(chunks)).toContain('pong')
      expect(chunks.some((c) => c.type === 'RUN_FINISHED')).toBe(true)
      // The common default must stay silent: neither check may fire when the
      // app never asked for durability at all.
      expect(logger.warn).not.toHaveBeenCalled()

      await sbx.destroy()
    })
  },
)
