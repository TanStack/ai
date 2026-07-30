/**
 * The OpenCode adapter never journals: it drives the harness over the opencode
 * HTTP server, so there is no `spawnNdjson`, no journal to tail, no
 * `awaitAttachableJournal` to refuse a hopeless attach up front, and no
 * `alignedIfAttaching` to suppress an already-delivered prefix. An app that
 * wires `withSandbox({ runs, durability })` and routes runs here therefore gets
 * something that LOOKS durable while being unrecoverable.
 *
 * The response splits on whether a first attempt has already run:
 *
 * - A FRESH durable run only fails to be recoverable LATER, which an app may
 *   knowingly accept. That is a WARN — audible, not fatal — once per run.
 * - An ATTACH has already spent its first attempt (`sandboxRunDriver`'s `drive()`
 *   sets `attach: true` only when a previous host was streaming this run), so
 *   proceeding re-runs the agent against the workspace that attempt mutated and
 *   double-appends its output to the run log. That is a THROW.
 *
 * The gate sits immediately after the sandbox is resolved and BEFORE
 * `startOpencodeServerInSandbox`, which is what makes the refusal testable
 * without a live opencode server: on the attach path nothing is ever spawned, and
 * `mockSandbox` below records whether a spawn was attempted. That recorded flag
 * is the real assertion — the error message alone would not prove the agent
 * didn't run.
 */
import { describe, expect, it, vi } from 'vitest'
import {
  SandboxCapability,
  SandboxDurabilityCapability,
} from '@tanstack/ai-sandbox'
import { InMemoryRunStore } from '@tanstack/ai'
import { opencodeText } from '../src/index'
import type { InternalLogger } from '@tanstack/ai/adapter-internals'
import type {
  CapabilityContext,
  StreamChunk,
  StreamDurability,
} from '@tanstack/ai'
import type {
  SandboxHandle,
  SandboxRunDurability,
  SpawnHandle,
} from '@tanstack/ai-sandbox'

const MODEL = 'anthropic/claude-sonnet-4-5'

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

async function* stdoutOf(values: Array<string>): AsyncIterable<string> {
  for (const v of values) {
    await Promise.resolve()
    yield v
  }
}

/**
 * A sandbox that RECORDS whether the adapter tried to spawn anything. The
 * server-readiness line is scripted so the fresh-durable case gets past the
 * launch helper and proves the run continued rather than being refused.
 */
function mockSandbox(): SandboxHandle & { spawns: Array<string> } {
  const spawns: Array<string> = []
  const spawnHandle: SpawnHandle = {
    pid: 1,
    stdout: stdoutOf(['opencode server listening on http://0.0.0.0:4096\n']),
    stderr: stdoutOf([]),
    stdin: { write: () => Promise.resolve(), end: () => Promise.resolve() },
    wait: () => Promise.resolve(0),
    kill: () => Promise.resolve(),
  }
  const handle = {
    id: 'sbx',
    provider: 'mock',
    capabilities: {} as SandboxHandle['capabilities'],
    fs: { write: () => Promise.resolve() } as unknown as SandboxHandle['fs'],
    git: {} as SandboxHandle['git'],
    process: {
      exec: () => Promise.reject(new Error('unused')),
      spawn: (command: string) => {
        spawns.push(command)
        return Promise.resolve(spawnHandle)
      },
    },
    ports: {
      connect: (port: number) =>
        Promise.resolve({ url: `http://127.0.0.1:${port}` }),
    },
    env: { set: () => Promise.resolve() },
    destroy: () => Promise.resolve(),
    spawns,
  }
  return handle as unknown as SandboxHandle & { spawns: Array<string> }
}

/** Never expected to be exercised: this adapter does not journal, which is the condition under test. */
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
    journalDir: '/tmp/tanstack-opencode-attach-unused',
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

/**
 * Drain the stream, but give up after `ms` and return what arrived.
 *
 * A plain `collect` would be right for the refusal (it terminates at once) and
 * wrong for diagnosing its ABSENCE: if the refusal ever regressed, the run would
 * proceed and then hang against the mock's advertised-but-unlistened port, so the
 * failure would surface as "test timed out" instead of the assertion that
 * actually caught it. Bounding the drain keeps the red pointing at the spawn that
 * should not have happened.
 */
async function collectWithin(
  stream: AsyncIterable<StreamChunk>,
  ms: number,
): Promise<Array<StreamChunk>> {
  const out: Array<StreamChunk> = []
  const iterator = stream[Symbol.asyncIterator]()
  const deadline = Date.now() + ms
  for (;;) {
    const remaining = deadline - Date.now()
    if (remaining <= 0) break
    const step = await Promise.race([
      iterator.next(),
      new Promise<'timeout'>((resolve) =>
        setTimeout(() => resolve('timeout'), remaining),
      ),
    ])
    if (step === 'timeout') break
    if (step.done === true) return out
    out.push(step.value)
  }
  // Abandoned, not awaited: an async generator serializes its queue, so
  // `return()` would wait behind the `next()` that just failed to settle.
  void Promise.resolve(iterator.return?.()).catch(() => {})
  return out
}

function errorMessageOf(chunks: Array<StreamChunk>): string | undefined {
  const err = chunks.find((c) => c.type === 'RUN_ERROR')
  return (err as { message?: string } | undefined)?.message
}

/**
 * Start the stream and stop as soon as the harness spawn is observed.
 *
 * The NON-refused cases cannot be collected to completion: past the gate the
 * adapter opens a real HTTP session against the mock's advertised port, where
 * nothing is listening, so the stream neither yields nor settles. That hang is
 * irrelevant to what these tests assert — the gate's decision is fully made
 * before the spawn, so observing the spawn is observing the decision. Kicking the
 * generator with one `next()` we never await, then polling for the spawn, tests
 * exactly that and terminates.
 *
 * Neither the `next()` nor the `return()` may be awaited. An async generator
 * serializes its own queue, so `return()` waits behind the still-pending
 * `next()` and would hang just as long as the thing we are avoiding. Both are
 * therefore fired and abandoned, with rejections swallowed so an abandoned
 * promise cannot surface as an unhandled rejection. Nothing real leaks: the
 * spawn is a mock and the only OS resource is a socket to a port with no
 * listener, which the runtime tears down on its own.
 */
async function startUntilSpawn(
  stream: AsyncIterable<StreamChunk>,
  sandbox: { spawns: Array<string> },
): Promise<void> {
  const iterator = stream[Symbol.asyncIterator]()
  void Promise.resolve(iterator.next()).catch(() => {})
  const deadline = Date.now() + 4000
  while (sandbox.spawns.length === 0 && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  void Promise.resolve(iterator.return?.()).catch(() => {})
}

describe('opencode durability on a never-journaling adapter', () => {
  it('REFUSES an attach outright, without spawning the harness', async () => {
    const sandbox = mockSandbox()
    const logger = noopLogger()

    const chunks = await collectWithin(
      opencodeText(MODEL).chatStream({
        model: MODEL,
        runId: 'r-attach-refused',
        messages: [{ role: 'user', content: 'hi' }],
        logger,
        capabilities: contextWith(sandbox, durability(true)),
      }),
      3000,
    )

    // THE POINT OF THE THROW, asserted FIRST because it is the load-bearing
    // safety property and the one whose failure must be legible: nothing ran. No
    // opencode server was spawned, so the workspace the previous attempt mutated
    // was not re-driven and nothing was appended to the run log.
    expect(sandbox.spawns).toEqual([])
    expect(chunks.some((c) => c.type === 'RUN_STARTED')).toBe(false)

    // The adapter's `catch` turns any throw into a RUN_ERROR chunk, so assert on
    // that rather than on a rejection.
    const message = errorMessageOf(chunks)
    expect(message).toContain('cannot ATTACH')

    // The refusal must state the CONSEQUENCE, not merely the condition — that is
    // what makes it actionable instead of something an operator retries.
    expect(message).toMatch(/re-run the agent from scratch/i)
    expect(message).toMatch(/double-append/i)
    // And rule the retry out explicitly, because the neighbouring
    // `JournalAttachUnavailableError` IS retryable.
    expect(message).toMatch(/not a transient condition/i)

    // A refusal, not the warn escalated: warning here would mean it proceeded.
    expect(logger.warn).not.toHaveBeenCalled()
  })

  it('warns exactly once and PROCEEDS past the gate on a fresh durable run', async () => {
    const sandbox = mockSandbox()
    const logger = noopLogger()

    await startUntilSpawn(
      opencodeText(MODEL).chatStream({
        model: MODEL,
        runId: 'r-fresh-durable',
        messages: [{ role: 'user', content: 'hi' }],
        logger,
        capabilities: contextWith(sandbox, durability(false)),
      }),
      sandbox,
    )

    // Once per run, not per chunk — a per-chunk warning would be worse than
    // none, so the COUNT is the assertion, not merely that it fired.
    expect(logger.warn).toHaveBeenCalledTimes(1)
    const [message] = logger.warn.mock.calls[0] as [string]
    expect(message).toMatch(/not be recoverable/i)
    // It must name a fix, or it is only noise.
    expect(message).toMatch(/journaling harness adapter/i)

    // PROCEEDED: the fresh run is not refused, and the proof is that it reached
    // the spawn the attach case never got to.
    expect(sandbox.spawns.length).toBeGreaterThan(0)
  })

  it('is byte-identical to today when no durability is wired', async () => {
    const sandbox = mockSandbox()
    const logger = noopLogger()

    await startUntilSpawn(
      opencodeText(MODEL).chatStream({
        model: MODEL,
        runId: 'r-no-durability',
        messages: [{ role: 'user', content: 'hi' }],
        logger,
        capabilities: contextWith(sandbox),
      }),
      sandbox,
    )

    // The common default stays silent and unchanged: neither check may fire when
    // the app never asked for durability at all, and the run proceeds exactly as
    // before to the same spawn.
    expect(logger.warn).not.toHaveBeenCalled()
    expect(sandbox.spawns.length).toBeGreaterThan(0)
  })
})
