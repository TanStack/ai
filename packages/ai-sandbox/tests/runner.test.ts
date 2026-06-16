import { describe, expect, it } from 'vitest'
import { spawnNdjson, toLines } from '../src/runner'
import type { SandboxHandle, SpawnHandle } from '../src/contracts'

async function* fromChunks(chunks: Array<string>): AsyncIterable<string> {
  for (const c of chunks) {
    // Yield asynchronously to mimic real stream scheduling.
    await Promise.resolve()
    yield c
  }
}

async function collect<T>(it: AsyncIterable<T>): Promise<Array<T>> {
  const out: Array<T> = []
  for await (const v of it) out.push(v)
  return out
}

/** Minimal handle whose process.spawn replays scripted stdout chunks. */
function handleSpawning(chunks: Array<string>): SandboxHandle {
  const spawnHandle: SpawnHandle = {
    pid: 1,
    stdout: fromChunks(chunks),
    stderr: fromChunks([]),
    stdin: { write: () => Promise.resolve(), end: () => Promise.resolve() },
    wait: () => Promise.resolve(0),
    kill: () => Promise.resolve(),
  }
  return {
    id: 'fake',
    provider: 'fake',
    capabilities: {
      fs: true,
      exec: true,
      env: true,
      ports: false,
      backgroundProcesses: true,
      snapshots: false,
      networkPolicy: false,
      durableFilesystem: false,
      fork: false,
    },
    // Only process.spawn is exercised here.
    fs: {} as SandboxHandle['fs'],
    git: {} as SandboxHandle['git'],
    process: {
      exec: () => Promise.reject(new Error('unused')),
      spawn: () => Promise.resolve(spawnHandle),
    },
    ports: { connect: () => Promise.reject(new Error('unused')) },
    env: { set: () => Promise.resolve() },
    destroy: () => Promise.resolve(),
  }
}

describe('toLines', () => {
  it('reassembles lines split across chunk boundaries', async () => {
    const lines = await collect(toLines(fromChunks(['{"a":', '1}\n{"b":2', '}\n'])))
    expect(lines).toEqual(['{"a":1}', '{"b":2}'])
  })

  it('emits a trailing unterminated line', async () => {
    const lines = await collect(toLines(fromChunks(['one\ntwo'])))
    expect(lines).toEqual(['one', 'two'])
  })
})

describe('spawnNdjson', () => {
  it('parses NDJSON events from stdout, skipping blank + non-JSON lines', async () => {
    const nonJson: Array<string> = []
    const handle = handleSpawning([
      'Claude Code starting...\n', // banner -> onNonJsonLine
      '{"type":"text","delta":"hi"}\n',
      '\n', // blank -> skipped
      '{"type":"result","ok":true}\n',
    ])
    const events = await collect(
      spawnNdjson(handle, 'claude -p --output-format stream-json', {
        onNonJsonLine: (l) => nonJson.push(l),
      }),
    )
    expect(events).toEqual([
      { type: 'text', delta: 'hi' },
      { type: 'result', ok: true },
    ])
    expect(nonJson).toEqual(['Claude Code starting...'])
  })
})
