import { afterAll, describe, expect, it } from 'vitest'
import * as fsp from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { localProcessSandbox } from '@tanstack/ai-sandbox-local-process'
import {
  SandboxCapability,
  chunkFingerprint,
  createRunScopedIdGen,
  journalPaths,
} from '@tanstack/ai-sandbox'
import { grokBuildText } from '../src/index'
import { translateThreadEvents } from '../src/stream/translate'
import type { InternalLogger } from '@tanstack/ai/adapter-internals'
import type { GrokBuildStreamEvent } from '../src/stream/sdk-types'
import type { AdapterYieldChunk, CapabilityContext } from '@tanstack/ai'
import type { SandboxHandle } from '@tanstack/ai-sandbox'

/**
 * A resuming host re-reads the sandbox journal from byte 0 and re-translates
 * it. That is only safe if re-translating the same event bytes produces the
 * same chunks — otherwise the resumed host mints new message ids for events
 * the dead host already delivered, and the client silently duplicates text /
 * corrupts tool-call JSON (see `packages/ai-sandbox/src/chunk-identity.ts`).
 *
 * This fixture is copied from the real native `streaming-json` shapes
 * (`thought` / `text` / `end`) documented in `../src/stream/sdk-types.ts` and
 * exercised in `translate.test.ts`. It deliberately narrates a shell command
 * inside `thought` (the real CLI's only way to signal tool execution — see
 * `GrokThoughtRouter`), so a single run exercises `genId()` multiple times:
 * once for the reasoning message, once for the synthesized tool call, once
 * for its result, and again for the post-tool reasoning span.
 *
 * NOTE on `emitDiffChunks`: the adapter appends a `file.changed` CUSTOM event
 * built from a `git diff` shelled out to the sandbox *after* translation ends
 * (see `chatStreamNdjson` in `../src/adapters/text.ts`). That diff read is not
 * part of the journaled/translated event sequence this test covers, and its
 * content depends on live sandbox filesystem state, not on the journal bytes.
 * Replay alignment can therefore only be guaranteed for the translator-level
 * chunk sequence asserted below, not for the trailing diff chunk.
 */

const FIXTURE: Array<GrokBuildStreamEvent> = [
  { type: 'thought', data: 'I will run `pnpm install` to set things up.' },
  { type: 'thought', data: ' The command ran successfully.' },
  { type: 'thought', data: ' Now writing the summary.' },
  { type: 'text', data: 'Done! ' },
  { type: 'text', data: 'Installed dependencies.' },
  {
    type: 'end',
    stopReason: 'EndTurn',
    sessionId: 'sess-determinism',
    requestId: 'req-1',
  },
]

async function translate(genId: () => string): Promise<Array<AdapterYieldChunk>> {
  async function* source() {
    for (const event of FIXTURE) yield event
  }
  const out: Array<AdapterYieldChunk> = []
  for await (const chunk of translateThreadEvents(source(), {
    model: 'grok-build',
    runId: 'run-determinism',
    threadId: 'thread-determinism',
    genId,
  })) {
    out.push(chunk)
  }
  return out
}

describe('translateThreadEvents determinism (journaled NDJSON path)', () => {
  it('produces identical chunk fingerprints across two fresh run-scoped generators', async () => {
    const first = await translate(createRunScopedIdGen('run-determinism'))
    const second = await translate(createRunScopedIdGen('run-determinism'))

    const firstFingerprints = first.map(chunkFingerprint)
    const secondFingerprints = second.map(chunkFingerprint)

    expect(first.length).toBeGreaterThan(0)
    expect(secondFingerprints).toEqual(firstFingerprints)
  })

  it('diverges when ids are not deterministic (teeth check)', async () => {
    const deterministic = await translate(
      createRunScopedIdGen('run-determinism'),
    )
    const random = await translate(
      () => `random-${Math.random().toString(36).slice(2)}`,
    )

    const deterministicFingerprints = deterministic.map(chunkFingerprint)
    const randomFingerprints = random.map(chunkFingerprint)

    expect(randomFingerprints).not.toEqual(deterministicFingerprints)
  })
})

// --- Wiring check: the actual adapter call site (not just the translator) ---
//
// The two tests above exercise `translateThreadEvents` directly with a
// generator we construct ourselves, so they cannot catch a regression at the
// `chatStreamNdjson` call site in `../src/adapters/text.ts` (e.g. reverting to
// `genId: () => this.generateId()`). This block runs the real adapter, via
// the same `localProcessSandbox` harness `text-adapter.test.ts` uses, and
// asserts message ids follow the `${runId}-N` shape `createRunScopedIdGen`
// produces — a shape `this.generateId()` (`${name}-${Date.now()}-${random}`)
// never produces.

const baseDir = path.join(
  os.tmpdir(),
  `tanstack-ai-grok-build-determinism-test-${Date.now()}`,
)
const provider = localProcessSandbox({ baseDir, removeOnDestroy: true })

afterAll(async () => {
  await fsp.rm(baseDir, { recursive: true, force: true })
})

const NATIVE_FAKE_GROK = [
  `import { writeFileSync } from 'node:fs'`,
  `const w = (o) => process.stdout.write(JSON.stringify(o) + '\\n')`,
  `w({ type: 'thought', data: 'Thinking about the answer.' })`,
  `w({ type: 'text', data: 'pong' })`,
  `w({ type: 'end', stopReason: 'EndTurn', sessionId: 'sess-1' })`,
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

describe('chatStreamNdjson wiring (real adapter, journaled call site)', () => {
  it('mints message ids scoped to the supplied runId, not clock/random ids', async () => {
    const sbx = await provider.create({})
    await sbx.fs.write('/workspace/fake-grok.mjs', NATIVE_FAKE_GROK)

    // Unique per invocation. Journals live at a real host path
    // (`/tmp/tanstack-runs`) OUTSIDE this test's own sandbox cleanup, and they
    // are append-only by design. A fixed literal id appends to the PREVIOUS
    // run's journal, and the reader then stops at that run's `__exit` sentinel:
    // the test reads a stale run's events, whose ids match this same literal
    // pattern, so it passes for the wrong reason. Keep this unique.
    const runId = `run-wiring-check-${Date.now()}-${Math.random().toString(36).slice(2)}`
    const adapter = grokBuildText('grok-build', {
      grokExecutable: 'node fake-grok.mjs',
      protocol: 'streaming-json',
    })

    const chunks = await collect(
      adapter.chatStream({
        model: 'grok-build',
        messages: [{ role: 'user', content: 'say pong' }],
        logger: noopLogger,
        runId,
        capabilities: capabilityContextWith(sbx),
      }),
    )

    const messageIds = chunks
      .map((c) => (c as { messageId?: unknown }).messageId)
      .filter((id): id is string => typeof id === 'string')

    expect(messageIds.length).toBeGreaterThan(0)
    for (const id of messageIds) {
      expect(id).toMatch(new RegExp(`^${runId}-\\d+$`))
    }

    // Best effort: drop this run's journal so `/tmp/tanstack-runs` does not grow
    // without bound across test runs. A failure here must not fail the test.
    try {
      const paths = journalPaths(runId)
      await sbx.process.exec(`rm -f '${paths.journal}' '${paths.stderr}'`)
    } catch {
      // Ignore: cleanup is opportunistic, not part of the assertion.
    }

    await sbx.destroy()
  })
})
