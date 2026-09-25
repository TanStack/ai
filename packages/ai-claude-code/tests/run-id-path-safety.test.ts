/**
 * Durability made `runId` CALLER-chosen, and this adapter interpolates it into
 * TWO filesystem paths:
 *
 * 1. the MCP bridge config, `${cwd}/.tanstack-mcp-bridge-${runId}.json`, whose
 *    bare filename is also handed to claude as `--mcp-config` RELATIVE to its
 *    cwd; and
 * 2. the stdin-fallback prompt file, `/tmp/tanstack-claude-prompt-${runId}`,
 *    taken when `sandbox.capabilities.writableStdin === false`.
 *
 * Raw, each is three hazards at once — a `/` silently turns the basename into a
 * nested path, `..` climbs out of the directory, and an over-long id fails the
 * spawn with `ENAMETOOLONG`. Both therefore go through `encodeRunId`, the same
 * encoder `journalPaths` uses, computed ONCE so the two filenames cannot drift.
 *
 * WHAT TO ASSERT, precisely. The encoded token still CONTAINS `..` — `.` is a
 * pass-through-safe character, so `encodeRunId('..')` is `'..'`. That is not a
 * defect, and asserting its absence would assert the wrong thing. Traversal is
 * defeated by escaping the SEPARATOR: with no `/` in the token, `..` is inert
 * text inside a single path segment with nothing to climb. These tests pin the
 * absence of `/` and the exact single-segment shape, never the absence of `..`.
 *
 * This is path safety, not shell injection: `q()` already quotes every value
 * reaching a shell, and these assertions deliberately do not re-test it.
 */
import { describe, expect, it } from 'vitest'
import * as path from 'node:path'
import {
  SandboxCapability,
  ToolBridgeProvisionerCapability,
} from '@tanstack/ai-sandbox'
import { claudeCodeText } from '../src/index'
import type { InternalLogger } from '@tanstack/ai/adapter-internals'
import type {
  AdapterYieldChunk,
  AnyTool,
  CapabilityContext,
} from '@tanstack/ai'
import type {
  ProvisionedBridge,
  SandboxHandle,
  ToolBridgeProvisioner,
} from '@tanstack/ai-sandbox'

const MODEL = 'haiku'
const WORKDIR = '/workspace'
const MCP_PREFIX = `${WORKDIR}/.tanstack-mcp-bridge-`
const MCP_SUFFIX = '.json'
const PROMPT_PREFIX = '/tmp/tanstack-claude-prompt-'

const noopLogger = {
  request: () => {},
  provider: () => {},
  errors: () => {},
  agentLoop: () => {},
  warnings: () => {},
  debug: () => {},
  warn: () => {},
} as unknown as InternalLogger

/** Enough of a claude stream-json turn for `chatStream` to run to completion. */
const EVENTS = [
  {
    type: 'system',
    subtype: 'init',
    session_id: 'sess-1',
    model: MODEL,
    tools: [],
  },
  {
    type: 'result',
    subtype: 'success',
    session_id: 'sess-1',
    is_error: false,
    result: 'ok',
  },
]

/** One tool, purely so `bridge` is provisioned and the MCP-config path is taken. */
const A_TOOL: AnyTool = {
  name: 'noop',
  description: 'does nothing',
  inputSchema: { type: 'object', properties: {} },
  execute: () => 'ok',
}

/**
 * A provisioner returning a STATIC bridge. No real server: this file asserts on
 * the config file's PATH, never on anything served over it, so standing up an
 * HTTP listener (as `tool-bridge-roundtrip.test.ts` must) would add a moving part
 * with no bearing on the assertion.
 */
function staticBridgeProvisioner(): ToolBridgeProvisioner {
  return {
    provision: () => {
      const bridge: ProvisionedBridge = {
        name: 'tanstack',
        url: 'http://127.0.0.1:1/mcp',
        token: 'test-token',
        close: () => Promise.resolve(),
      }
      return Promise.resolve(bridge)
    },
  }
}

/**
 * A synthetic handle reporting `writableStdin: false` — the condition selecting
 * the prompt-file branch — which RECORDS every path handed to `fs.write`.
 * Recording the write makes the assertion exact: the path the adapter computed is
 * captured verbatim, with no parsing of a shell command and no dependence on how
 * a redirect is quoted. Reporting `writableStdin: false` also means ONE run
 * exercises BOTH interpolation sites, which is what lets the final test assert
 * the two filenames agree on how a given id spells.
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
  const [, provideProvisioner] = ToolBridgeProvisionerCapability
  const ctx = {
    capabilities: { markProvided: () => {}, has: () => true },
  } as unknown as CapabilityContext
  provideSandbox(ctx, handle)
  provideProvisioner(ctx, staticBridgeProvisioner())
  return ctx
}

interface RunPaths {
  mcpConfig: string
  prompt: string
}

/** Drive one run with the given caller-chosen runId and return BOTH paths it wrote. */
async function pathsFor(runId: string): Promise<RunPaths> {
  const handle = recordingHandle()
  const chunks: Array<AdapterYieldChunk> = []
  for await (const chunk of claudeCodeText(MODEL, {
    claudeExecutable: 'node fake-claude.mjs',
    streamPartials: false,
    emitDiff: false,
  }).chatStream({
    model: MODEL,
    runId,
    messages: [{ role: 'user', content: 'hi' }],
    logger: noopLogger,
    capabilities: capabilityContext(handle),
    tools: [A_TOOL],
  })) {
    chunks.push(chunk)
  }
  const mcpConfig = handle.writes.find((target) =>
    target.startsWith(MCP_PREFIX),
  )
  const prompt = handle.writes.find((target) =>
    target.startsWith(PROMPT_PREFIX),
  )
  if (mcpConfig === undefined || prompt === undefined) {
    throw new Error(
      `expected both an MCP config and a prompt write; got: ${JSON.stringify(handle.writes)}`,
    )
  }
  return { mcpConfig, prompt }
}

/**
 * Assert the shape that makes a path safe regardless of what the runId contained:
 * it stays directly in its intended directory, is ONE segment, and is short
 * enough to create.
 */
function expectSafeBoundedSingleSegment(
  fullPath: string,
  prefix: string,
  suffix = '',
): void {
  const interpolated = fullPath.slice(
    prefix.length,
    suffix === '' ? undefined : fullPath.length - suffix.length,
  )

  // THE traversal defence: no separator in the interpolated part, so whatever it
  // contains — `..` included — is inert text within a single segment.
  expect(interpolated).not.toContain('/')
  expect(interpolated).not.toContain('\\')

  // Still exactly `<dir>/<one-name>`: normalizing must be a no-op, which is the
  // direct statement that nothing climbed out of or descended below that dir.
  expect(path.posix.normalize(fullPath)).toBe(fullPath)
  expect(path.posix.dirname(fullPath)).toBe(path.posix.dirname(prefix + 'x'))

  // Creatable: comfortably inside the 255-byte limit every common filesystem has.
  expect(
    Buffer.byteLength(path.posix.basename(fullPath), 'utf8'),
  ).toBeLessThanOrEqual(255)
}

function expectBothSafe(paths: RunPaths): void {
  expectSafeBoundedSingleSegment(paths.mcpConfig, MCP_PREFIX, MCP_SUFFIX)
  expectSafeBoundedSingleSegment(paths.prompt, PROMPT_PREFIX)
}

describe('claude-code path safety for a caller-chosen runId', () => {
  it('keeps a runId containing / inside one segment, at both sites', async () => {
    expectBothSafe(await pathsFor('team/alice/run-1'))
  })

  it('keeps a runId containing .. inside one segment, at both sites', async () => {
    // `..` SURVIVES in the token (`.` is pass-through safe) and that is correct —
    // see the header. What must not survive is a separator it could act on.
    expectBothSafe(await pathsFor('../../../etc/passwd'))
  })

  it('bounds a runId far longer than any filename limit, at both sites', async () => {
    // >240 bytes, so `encodeRunId`'s truncate-plus-hash branch is what is under
    // test, not merely the per-character escape.
    const long = 'r'.repeat(300)
    expect(Buffer.byteLength(long, 'utf8')).toBeGreaterThan(240)
    expectBothSafe(await pathsFor(long))
  })

  it('never collides two distinct runIds, including a traversal that would alias another run', async () => {
    // Chosen so the UNENCODED prompt paths are literally the same file: a leading
    // `x/` closes the prefix into its own segment, the `..` then pops it, and what
    // remains is exactly the path the second id produces. Unencoded, one run's
    // prompt silently overwrites the other's.
    //
    // The id must OPEN with `x/` for this to work: a bare `..` would glue onto the
    // prefix's trailing `-` as the segment `tanstack-claude-prompt-..`, which
    // normalizes to nothing. That is the mechanism in one line — traversal needs
    // the SEPARATOR, which is exactly what `encodeRunId` escapes, and exactly why
    // these tests assert on `/` and not on `..`.
    const aliasing = 'x/../tanstack-claude-prompt-y'
    const plain = 'y'
    expect(path.posix.normalize(`${PROMPT_PREFIX}${aliasing}`)).toBe(
      `${PROMPT_PREFIX}${plain}`,
    )

    const [aliasingPaths, plainPaths] = await Promise.all([
      pathsFor(aliasing),
      pathsFor(plain),
    ])

    // The collision assertions come FIRST so a regression reds out as the
    // aliasing it is, rather than as a generic shape violation. Both sites are
    // checked: encoded, each keeps the two runs in distinct files, and they stay
    // distinct after normalization, so the separation is real and not an
    // unresolved `..`.
    expect(path.posix.normalize(aliasingPaths.prompt)).not.toBe(
      path.posix.normalize(plainPaths.prompt),
    )
    expect(path.posix.normalize(aliasingPaths.mcpConfig)).not.toBe(
      path.posix.normalize(plainPaths.mcpConfig),
    )

    expectBothSafe(aliasingPaths)
    expectBothSafe(plainPaths)
  })

  it('spells the runId identically in both filenames', async () => {
    // The two sites share one `encodeRunId(runId)` binding precisely so they
    // cannot drift. Pin that: a future edit re-encoding at only one site would
    // leave the MCP config and the prompt file disagreeing about the same run.
    const paths = await pathsFor('team/alice/../run-1')
    const mcpToken = paths.mcpConfig.slice(
      MCP_PREFIX.length,
      paths.mcpConfig.length - MCP_SUFFIX.length,
    )
    const promptToken = paths.prompt.slice(PROMPT_PREFIX.length)
    expect(mcpToken).toBe(promptToken)
  })
})
