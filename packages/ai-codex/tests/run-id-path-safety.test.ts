/**
 * Durability made `runId` CALLER-chosen, and this adapter interpolates it into a
 * filesystem path: the stdin-fallback prompt file
 * (`/tmp/tanstack-codex-prompt-${runId}`, taken when
 * `sandbox.capabilities.writableStdin === false`). Raw, that is three separate
 * hazards — a `/` silently turns the basename into a nested path, `..` climbs out
 * of `/tmp` entirely, and an over-long id fails the spawn with `ENAMETOOLONG`.
 *
 * So the id goes through `encodeRunId`, the same encoder `journalPaths` uses.
 *
 * WHAT TO ASSERT, precisely. The encoded token still CONTAINS `..` — `.` is a
 * pass-through-safe character, so `encodeRunId('..')` is `'..'`. That is not a
 * defect and asserting its absence would be asserting the wrong thing. Traversal
 * is defeated by escaping the SEPARATOR: with no `/` in the token, `..` is inert
 * text inside one path segment and has nothing to climb. These tests therefore
 * pin the absence of `/` and the exact single-segment shape, never the absence of
 * `..`.
 *
 * This is path safety, not shell injection: `q()` already quotes every value
 * that reaches a shell, and the assertions below deliberately do not re-test it.
 */
import { describe, expect, it } from 'vitest'
import * as path from 'node:path'
import { SandboxCapability } from '@tanstack/ai-sandbox'
import { codexText } from '../src/index'
import type { InternalLogger } from '@tanstack/ai/adapter-internals'
import type { AdapterYieldChunk, CapabilityContext } from '@tanstack/ai'
import type { SandboxHandle } from '@tanstack/ai-sandbox'

const MODEL = 'gpt-5.5-codex'
const PROMPT_PREFIX = '/tmp/tanstack-codex-prompt-'

const noopLogger = {
  request: () => {},
  provider: () => {},
  errors: () => {},
  agentLoop: () => {},
  warnings: () => {},
  debug: () => {},
  warn: () => {},
} as unknown as InternalLogger

/** Enough of a codex NDJSON turn for `chatStream` to run to completion. */
const EVENTS = [
  { type: 'thread.started', thread_id: 'th-1' },
  { type: 'turn.started' },
  { type: 'turn.completed', usage: { input_tokens: 1, output_tokens: 1 } },
]

/**
 * A synthetic handle reporting `writableStdin: false` — the condition that
 * selects the prompt-file branch under test — which RECORDS every path handed to
 * `fs.write`. Recording the write is what makes the assertion exact: the path the
 * adapter computed is captured verbatim, with no parsing of a shell command and
 * no dependence on how the redirect is quoted.
 *
 * Synthetic rather than `localProcessSandbox` for the reason
 * `attach.test.ts` documents at this same branch: that provider resolves
 * `fs.write` under a virtualized root while a `< /tmp/...` shell redirect hits
 * the real host `/tmp`. That split is orthogonal to which STRING the adapter
 * builds, so a fake sidesteps it.
 */
function recordingHandle(): SandboxHandle & { writes: Array<string> } {
  const writes: Array<string> = []
  return {
    id: 'fake',
    provider: 'fake',
    capabilities: {
      fs: true,
      exec: true,
      env: false,
      ports: false,
      backgroundProcesses: true,
      writableStdin: false,
      killableProcesses: true,
      snapshots: false,
      networkPolicy: false,
      durableFilesystem: false,
      fork: false,
    },
    fs: {
      read: () => Promise.resolve(''),
      readBytes: () => Promise.resolve(new Uint8Array()),
      write: (target: string) => {
        writes.push(target)
        return Promise.resolve()
      },
      list: () => Promise.resolve([]),
      mkdir: () => Promise.resolve(),
      remove: () => Promise.resolve(),
      rename: () => Promise.resolve(),
      exists: () => Promise.resolve(false),
    },
    git: {},
    process: {
      exec: () => Promise.reject(new Error('exec unused by this path')),
      spawn: () =>
        Promise.resolve({
          pid: 1,
          stdout: (async function* () {
            for (const event of EVENTS) yield `${JSON.stringify(event)}\n`
          })(),
          stderr: (async function* () {})(),
          stdin: {
            write: () => Promise.resolve(),
            end: () => Promise.resolve(),
          },
          wait: () => Promise.resolve(0),
          kill: () => Promise.resolve(),
        }),
    },
    ports: {},
    env: {},
    destroy: () => Promise.resolve(),
    writes,
  } as unknown as SandboxHandle & { writes: Array<string> }
}

function capabilityContext(handle: SandboxHandle): CapabilityContext {
  const [, provideSandbox] = SandboxCapability
  const ctx = {
    capabilities: { markProvided: () => {}, has: () => true },
  } as unknown as CapabilityContext
  provideSandbox(ctx, handle)
  return ctx
}

/** Drive one run with the given caller-chosen runId and return the prompt path it wrote. */
async function promptPathFor(runId: string): Promise<string> {
  const handle = recordingHandle()
  const chunks: Array<AdapterYieldChunk> = []
  for await (const chunk of codexText(MODEL).chatStream({
    model: MODEL,
    runId,
    messages: [{ role: 'user', content: 'hi' }],
    logger: noopLogger,
    capabilities: capabilityContext(handle),
  })) {
    chunks.push(chunk)
  }
  const promptWrite = handle.writes.find((target) =>
    target.startsWith(PROMPT_PREFIX),
  )
  if (promptWrite === undefined) {
    throw new Error(
      `no prompt file written; got: ${JSON.stringify(handle.writes)}`,
    )
  }
  return promptWrite
}

/**
 * Assert the shape that makes a path safe regardless of what the runId contained:
 * it stays directly in `/tmp`, is ONE segment, and is short enough to create.
 */
function expectSafeBoundedSingleSegment(promptPath: string): void {
  const suffix = promptPath.slice(PROMPT_PREFIX.length)

  // THE traversal defence: no separator in the interpolated part, so whatever it
  // contains — `..` included — is inert text within a single segment.
  expect(suffix).not.toContain('/')
  expect(suffix).not.toContain('\\')

  // Still exactly `/tmp/<one-name>`: normalizing must be a no-op, which is the
  // direct statement that nothing climbed out of or descended below `/tmp`.
  expect(path.posix.normalize(promptPath)).toBe(promptPath)
  expect(path.posix.dirname(promptPath)).toBe('/tmp')

  // Creatable: comfortably inside the 255-byte limit every common filesystem has.
  const basename = path.posix.basename(promptPath)
  expect(Buffer.byteLength(basename, 'utf8')).toBeLessThanOrEqual(255)
}

describe('codex prompt-file path safety for a caller-chosen runId', () => {
  it('keeps a runId containing / inside one segment of /tmp', async () => {
    expectSafeBoundedSingleSegment(await promptPathFor('team/alice/run-1'))
  })

  it('keeps a runId containing .. inside one segment of /tmp', async () => {
    // `..` SURVIVES in the token (`.` is pass-through safe) and that is correct —
    // see the header. What must not survive is a separator it could act on.
    expectSafeBoundedSingleSegment(await promptPathFor('../../../etc/passwd'))
  })

  it('bounds a runId far longer than any filename limit', async () => {
    // >240 bytes, so `encodeRunId`'s truncate-plus-hash branch is the thing under
    // test, not merely the per-character escape.
    const long = 'r'.repeat(300)
    expect(Buffer.byteLength(long, 'utf8')).toBeGreaterThan(240)
    expectSafeBoundedSingleSegment(await promptPathFor(long))
  })

  it('never collides two distinct runIds, including a traversal that would alias another run', async () => {
    // Chosen so the UNENCODED paths are literally the same file: a leading
    // `x/` closes the prefix into its own segment, the `..` then pops it, and
    // what remains is exactly the path the second id produces. Unencoded, one
    // run's prompt silently overwrites the other's.
    //
    // Note the id must open with `x/` for this to work at all: a bare `..` would
    // glue onto the trailing `-` of the prefix as the segment
    // `tanstack-codex-prompt-..`, which normalizes to nothing. That is the
    // mechanism in one line — traversal needs the SEPARATOR, which is precisely
    // what `encodeRunId` escapes, and precisely why these tests assert on `/`
    // and not on `..`.
    const aliasing = 'x/../tanstack-codex-prompt-y'
    const plain = 'y'
    expect(path.posix.normalize(`${PROMPT_PREFIX}${aliasing}`)).toBe(
      `${PROMPT_PREFIX}${plain}`,
    )

    const [aliasingPath, plainPath] = await Promise.all([
      promptPathFor(aliasing),
      promptPathFor(plain),
    ])

    // The collision assertion comes FIRST so that a regression reds out as the
    // aliasing it is, rather than as a generic shape violation.
    //
    // Encoded, they are different files — and remain different after
    // normalization, so the separation is real and not an unresolved `..`.
    expect(path.posix.normalize(aliasingPath)).not.toBe(
      path.posix.normalize(plainPath),
    )
    expect(aliasingPath).not.toBe(plainPath)

    expectSafeBoundedSingleSegment(aliasingPath)
    expectSafeBoundedSingleSegment(plainPath)
  })
})
