/**
 * Before the spawn the adapter writes up to five temp files, and removes them
 * in `finally`. On a remote sandbox every `fs` call is a round trip, so these
 * tests pin that the writes run in parallel, the removes run in parallel, and
 * a failed remove does not stop the others.
 */
import { describe, expect, it } from 'vitest'
import {
  SandboxCapability,
  ToolBridgeProvisionerCapability,
} from '@tanstack/ai-sandbox'
import { claudeCodeText } from '../src/index'
import { noopLogger } from './fakes'
import type { AnyTool, CapabilityContext } from '@tanstack/ai'
import type { SandboxHandle } from '@tanstack/ai-sandbox'

const EVENTS = [
  {
    type: 'system',
    subtype: 'init',
    session_id: 's',
    model: 'haiku',
    tools: [],
  },
  {
    type: 'result',
    subtype: 'success',
    session_id: 's',
    is_error: false,
    result: 'ok',
  },
]

/** One tool, so the MCP bridge config file is written too. */
const A_TOOL: AnyTool = {
  name: 'noop',
  description: 'does nothing',
  inputSchema: { type: 'object', properties: {} },
  execute: () => 'ok',
}

/** Counts how many calls of one kind are in flight at the same time. */
function concurrency() {
  let inFlight = 0
  const counter = {
    calls: [] as Array<string>,
    max: 0,
    async run(path: string, fail = false): Promise<void> {
      counter.calls.push(path)
      inFlight++
      counter.max = Math.max(counter.max, inFlight)
      await new Promise((resolve) => setTimeout(resolve, 5))
      inFlight--
      if (fail) throw new Error(`remove failed: ${path}`)
    },
  }
  return counter
}

function recordingHandle() {
  const writes = concurrency()
  const removes = concurrency()
  const handle = {
    id: 'fake',
    provider: 'fake',
    capabilities: {
      fs: true,
      exec: true,
      env: false,
      ports: false,
      backgroundProcesses: true,
      // Adds the prompt file to the writes.
      writableStdin: false,
      killableProcesses: true,
      snapshots: false,
      networkPolicy: false,
      durableFilesystem: false,
      fork: false,
    },
    fs: {
      write: (path: string) => writes.run(path),
      // The first remove fails; the others must still run.
      remove: (path: string) => removes.run(path, removes.calls.length === 0),
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
  } as unknown as SandboxHandle
  return { handle, writes, removes }
}

function capabilityContext(handle: SandboxHandle): CapabilityContext {
  const [, provideSandbox] = SandboxCapability
  const [, provideProvisioner] = ToolBridgeProvisionerCapability
  const ctx = {
    capabilities: { markProvided: () => {}, has: () => true },
  } as unknown as CapabilityContext
  provideSandbox(ctx, handle)
  provideProvisioner(ctx, {
    provision: () =>
      Promise.resolve({
        name: 'tanstack',
        url: 'http://127.0.0.1:1/mcp',
        token: 'test-token',
        close: () => Promise.resolve(),
      }),
  })
  return ctx
}

describe('claude-code temp files', () => {
  it('writes and removes the temp files in parallel', async () => {
    const { handle, writes, removes } = recordingHandle()

    for await (const _chunk of claudeCodeText('haiku', {
      claudeExecutable: 'node fake-claude.mjs',
      streamPartials: false,
      emitDiff: false,
    }).chatStream({
      threadId: 'thread-1',
      model: 'haiku',
      runId: 'run-1',
      messages: [{ role: 'user', content: 'hi' }],
      logger: noopLogger,
      capabilities: capabilityContext(handle),
      tools: [A_TOOL],
      outputSchema: { type: 'object', properties: {} },
    })) {
      // drain
    }

    // MCP config, output schema, runner, argv, prompt.
    expect(writes.calls).toHaveLength(5)
    expect(writes.max).toBe(5)
    expect(removes.calls.toSorted()).toEqual(writes.calls.toSorted())
    expect(removes.max).toBe(5)
  })
})
