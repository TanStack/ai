import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { EventType, memoryStream } from '@tanstack/ai'
import {
  readJournalNdjson,
  spawnNdjson,
  startJournaledAgent,
  toLines,
} from '../src/runner'
import {
  exitSentinelLine,
  journalCleanupCommand,
  journalExistsCommand,
  journalFollowCommand,
  journalPaths,
  journalStderrReadCommand,
} from '../src/journal'
import { alignToStoredLog } from '../src/align'
import type { StreamChunk } from '@tanstack/ai'
import type { ExecResult, SandboxHandle, SpawnHandle } from '../src/contracts'

/**
 * The exit sentinel for run `r1` — the only runId these journal fixtures use.
 *
 * Built, never hand-written: the sentinel carries a per-run nonce so an agent's
 * own stdout cannot forge it (`journal.ts`), and a literal `{"__exit":0}` in a
 * fixture is therefore agent output that the reader must NOT stop at.
 */
function EXIT(exitCode: number): string {
  return exitSentinelLine(journalPaths('r1'), exitCode)
}

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
      writableStdin: true,
      killableProcesses: true,
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
    const lines = await collect(
      toLines(fromChunks(['{"a":', '1}\n{"b":2', '}\n'])),
    )
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

/**
 * Handle that records commands and replays scripted stdout per spawn call.
 *
 * Journal scripts are RAW journal text, not a base64 frame: `journalFollowCommand`
 * pipes into nothing, because any filter's stdio buffer would swallow the stream
 * (see `journal.ts` rule 2).
 */
function scriptedHandle(scripts: Array<Array<string>>): {
  handle: SandboxHandle
  commands: Array<string>
} {
  const commands: Array<string> = []
  let call = 0
  const handle: SandboxHandle = {
    ...handleSpawning([]),
    process: {
      exec: (command) => {
        commands.push(command)
        return Promise.resolve({ stdout: '', stderr: '', exitCode: 0 })
      },
      spawn: (command) => {
        commands.push(command)
        const script = scripts[call] ?? []
        call += 1
        return Promise.resolve({
          pid: -1,
          stdout: fromChunks(script),
          stderr: fromChunks([]),
          stdin: {
            write: () => Promise.resolve(),
            end: () => Promise.resolve(),
          },
          wait: () => Promise.resolve(0),
          kill: () => Promise.resolve(),
        })
      },
    },
  }
  return { handle, commands }
}

describe('startJournaledAgent', () => {
  it('spawns the agent with stdout redirected to the journal and does not read it', async () => {
    const { handle, commands } = scriptedHandle([[]])
    await startJournaledAgent(handle, 'claude -p', { journal: { runId: 'r1' } })
    expect(commands).toHaveLength(1)
    expect(commands[0]).toContain(`>> '/tmp/tanstack-runs/r1.ndjson'`)
    expect(commands[0]).toContain(`2>> '/tmp/tanstack-runs/r1.err'`)
    expect(commands[0]).toContain('claude -p')
  })

  it('writes stdin input then closes it, exactly as the unjournaled path does', async () => {
    const written: Array<string> = []
    let ended = false
    const base = handleSpawning([])
    const handle: SandboxHandle = {
      ...base,
      process: {
        exec: () => Promise.reject(new Error('unused')),
        spawn: () =>
          Promise.resolve({
            pid: -1,
            stdout: fromChunks([]),
            stderr: fromChunks([]),
            stdin: {
              write: (data: string) => {
                written.push(data)
                return Promise.resolve()
              },
              end: () => {
                ended = true
                return Promise.resolve()
              },
            },
            wait: () => Promise.resolve(0),
            kill: () => Promise.resolve(),
          }),
      },
    }
    await startJournaledAgent(handle, 'codex exec', {
      journal: { runId: 'r1' },
      input: 'the prompt',
    })
    expect(written).toEqual(['the prompt'])
    expect(ended).toBe(true)
  })

  it('returns without awaiting the agent process (a hung wait() must not block the trigger)', async () => {
    let waitCalled = false
    const base = handleSpawning([])
    const handle: SandboxHandle = {
      ...base,
      process: {
        exec: () => Promise.reject(new Error('unused')),
        spawn: () =>
          Promise.resolve({
            pid: -1,
            stdout: fromChunks([]),
            stderr: fromChunks([]),
            stdin: {
              write: () => Promise.resolve(),
              end: () => Promise.resolve(),
            },
            // Never resolves. If startJournaledAgent awaited this, the test
            // would hang until Vitest's timeout — the whole point of
            // journaling is that the trigger returns immediately while the
            // agent keeps running.
            wait: () =>
              new Promise<number>(() => {
                waitCalled = true
              }),
            kill: () => Promise.resolve(),
          }),
      },
    }
    await startJournaledAgent(handle, 'agent', { journal: { runId: 'r1' } })
    // Reaching here at all proves startJournaledAgent did not await wait().
    expect(waitCalled).toBe(false)
  })
})

describe('readJournalNdjson', () => {
  it('parses journal lines as JSON and stops at the exit sentinel', async () => {
    const { handle } = scriptedHandle([[`{"a":1}\n{"b":2}\n${EXIT(0)}\n`]])
    expect(
      await collect(readJournalNdjson(handle, { journal: { runId: 'r1' } })),
    ).toEqual([{ a: 1 }, { b: 2 }])
  })

  it('throws on a non-zero exit sentinel so the adapter emits RUN_ERROR', async () => {
    const { handle } = scriptedHandle([[`{"a":1}\n${EXIT(7)}\n`]])
    await expect(
      collect(readJournalNdjson(handle, { journal: { runId: 'r1' } })),
    ).rejects.toThrow(/exited with code 7/)
  })

  it('routes a non-JSON line to onNonJsonLine instead of failing the run', async () => {
    const seen: Array<string> = []
    const { handle } = scriptedHandle([
      [`Claude Code starting...\n{"a":1}\n${EXIT(0)}\n`],
    ])
    expect(
      await collect(
        readJournalNdjson(handle, {
          journal: { runId: 'r1' },
          onNonJsonLine: (line) => seen.push(line),
        }),
      ),
    ).toEqual([{ a: 1 }])
    expect(seen).toEqual(['Claude Code starting...'])
  })

  it('reads from byte 0 on attach, so alignment sees the whole run', async () => {
    const { handle, commands } = scriptedHandle([[`${EXIT(0)}\n`]])
    await collect(
      readJournalNdjson(handle, { journal: { runId: 'r1', attach: true } }),
    )
    // `commands[0]` is the attach preflight's `test -f`; the tail follows it.
    expect(commands.some((command) => command.includes('tail -c +1 -f'))).toBe(
      true,
    )
  })
})

/**
 * Handle that records EVERY sandbox interaction in one ordered timeline, which
 * is what the journal-cleanup contract is actually about: not that an `rm` is
 * issued, but that it is issued after the sentinel, after the reader is stopped,
 * and never on an abort.
 */
function timelineHandle(
  script: Array<string>,
  execImpl?: (command: string) => Promise<ExecResult>,
): { handle: SandboxHandle; timeline: Array<string> } {
  const timeline: Array<string> = []
  const handle: SandboxHandle = {
    ...handleSpawning([]),
    process: {
      exec: (command) => {
        timeline.push(`exec:${command}`)
        return (
          execImpl?.(command) ??
          Promise.resolve({ stdout: '', stderr: '', exitCode: 0 })
        )
      },
      spawn: (command) => {
        timeline.push(`spawn:${command}`)
        return Promise.resolve({
          pid: -1,
          stdout: fromChunks(script),
          stderr: fromChunks([]),
          stdin: {
            write: () => Promise.resolve(),
            end: () => Promise.resolve(),
          },
          wait: () => Promise.resolve(0),
          kill: () => {
            timeline.push('kill')
            return Promise.resolve()
          },
        })
      },
    },
  }
  return { handle, timeline }
}

const R1 = journalPaths('r1')

/** base64-frame text the way `journalStderrReadCommand`'s pipeline would. */
function stderrFrame(text: string): string {
  return btoa(text)
}

describe('readJournalNdjson journal cleanup', () => {
  it('deletes both files after a ZERO-exit sentinel, once the read has finished', async () => {
    const { handle, timeline } = timelineHandle([`{"a":1}\n${EXIT(0)}\n`])
    const events: Array<unknown> = []
    for await (const event of readJournalNdjson(handle, {
      journal: { runId: 'r1' },
    })) {
      events.push(event)
      timeline.push('yield')
    }
    expect(events).toEqual([{ a: 1 }])
    // The exact order is the deliverable: read, deliver, stop the tail, THEN rm.
    expect(timeline).toEqual([
      `spawn:${journalFollowCommand(R1, 0)}`,
      'yield',
      'kill',
      `exec:${journalCleanupCommand(R1)}`,
    ])
    expect(journalCleanupCommand(R1)).toBe(
      `rm -f '/tmp/tanstack-runs/r1.ndjson' '/tmp/tanstack-runs/r1.err'`,
    )
  })

  it('deletes after a NON-ZERO sentinel too, because the run is still terminal', async () => {
    const { handle, timeline } = timelineHandle([`${EXIT(7)}\n`], (command) =>
      Promise.resolve({
        stdout: command.startsWith('tail')
          ? stderrFrame('boom: tool not found\n')
          : '',
        stderr: '',
        exitCode: 0,
      }),
    )
    await expect(
      collect(readJournalNdjson(handle, { journal: { runId: 'r1' } })),
    ).rejects.toThrow(/exited with code 7: boom: tool not found/)
    // Sidecar read first (the rm destroys it), cleanup second, throw last.
    expect(timeline.filter((entry) => entry.startsWith('exec:'))).toEqual([
      `exec:${journalStderrReadCommand(R1)}`,
      `exec:${journalCleanupCommand(R1)}`,
    ])
  })

  it('does NOT delete anything when the consumer aborts mid-read', async () => {
    // An abort is not terminal. The consumer may be handing off to a successor
    // host that still needs every journal byte, so both files must survive.
    const controller = new AbortController()
    const { handle, timeline } = timelineHandle(['{"a":1}\n', '{"b":2}\n'])
    const events: Array<unknown> = []
    for await (const event of readJournalNdjson(handle, {
      journal: { runId: 'r1' },
      signal: controller.signal,
    })) {
      events.push(event)
      controller.abort()
    }
    expect(events).toEqual([{ a: 1 }])
    expect(timeline.some((entry) => entry.includes('rm -f'))).toBe(false)
    expect(timeline.filter((entry) => entry.startsWith('exec:'))).toEqual([])
  })

  it('THROWS, and deletes nothing, when the stream ends without a sentinel and nobody aborted', async () => {
    // A sentinel-less end with an UNaborted signal is a torn-down read: the
    // `tail` was killed, the sandbox went away, the pipe broke. The iterable ends
    // with no error, so returning here made the adapter emit a normally
    // completing but silently TRUNCATED run — in a function whose documented job
    // is to throw so the adapter converts it into a RUN_ERROR. It must throw, and
    // still delete nothing: the run may be mid-flight and a successor host may
    // need every byte.
    const { handle, timeline } = timelineHandle(['{"a":1}\n'])
    const events: Array<unknown> = []
    const error = await (async () => {
      try {
        for await (const event of readJournalNdjson(handle, {
          journal: { runId: 'r1' },
        })) {
          events.push(event)
        }
        return null
      } catch (cause: unknown) {
        return cause
      }
    })()
    expect(events).toEqual([{ a: 1 }])
    expect(error).toBeInstanceOf(Error)
    if (!(error instanceof Error)) throw new Error('expected a thrown Error')
    expect(error.message).toMatch(/without an exit sentinel/)
    expect(timeline.filter((entry) => entry.startsWith('exec:'))).toEqual([])
  })

  it('returns quietly, deleting nothing, when the CONSUMER aborted instead', async () => {
    // The other arm of the same branch, and the reason a bare `return` was not
    // safe to keep for both: an abort is the caller withdrawing, not a diagnosis
    // about the run, so it must NOT become a RUN_ERROR for a run that is very
    // possibly healthy and about to be taken over.
    const controller = new AbortController()
    const { handle, timeline } = timelineHandle(['{"a":1}\n'])
    const events: Array<unknown> = []
    for await (const event of readJournalNdjson(handle, {
      journal: { runId: 'r1' },
      signal: controller.signal,
    })) {
      events.push(event)
      controller.abort()
    }
    expect(events).toEqual([{ a: 1 }])
    expect(timeline.filter((entry) => entry.startsWith('exec:'))).toEqual([])
  })

  it('does not stop at an {"__exit":0} line the AGENT printed, and delivers it as an event', async () => {
    // The forgery, at the reader instead of the reaper: an agent that echoes a
    // fixture or dumps a file can put this exact line in the journal, because its
    // stdout and the sentinel share one unframed file. Stopping there truncates a
    // live run and (worse) reports it as exit 0. The nonce is what separates them,
    // so the unnonced line is just another event.
    const { handle, timeline } = timelineHandle([
      `{"__exit":0}\n{"a":1}\n${EXIT(0)}\n`,
    ])
    expect(
      await collect(readJournalNdjson(handle, { journal: { runId: 'r1' } })),
    ).toEqual([{ __exit: 0 }, { a: 1 }])
    // And the run really did reach its own sentinel, so cleanup ran exactly once.
    expect(
      timeline.filter((entry) => entry === `exec:${journalCleanupCommand(R1)}`),
    ).toHaveLength(1)
  })

  it('never deletes before the sentinel is observed', async () => {
    const { handle, timeline } = timelineHandle([
      '{"a":1}\n',
      '{"b":2}\n',
      `${EXIT(0)}\n`,
    ])
    const seenAtCleanup: Array<number> = []
    let delivered = 0
    for await (const event of readJournalNdjson(handle, {
      journal: { runId: 'r1' },
    })) {
      void event
      delivered += 1
      if (timeline.some((entry) => entry.includes('rm -f'))) {
        seenAtCleanup.push(delivered)
      }
    }
    // No `rm` was observed while events were still being delivered, and the run
    // did deliver every event before the sentinel.
    expect(seenAtCleanup).toEqual([])
    expect(delivered).toBe(2)
    expect(timeline[timeline.length - 1]).toBe(
      `exec:${journalCleanupCommand(R1)}`,
    )
  })

  it('a failing rm never fails a run that already completed', async () => {
    const { handle } = timelineHandle([`{"a":1}\n${EXIT(0)}\n`], (command) =>
      command.startsWith('rm -f')
        ? Promise.reject(new Error('rm: /tmp: read-only file system'))
        : Promise.resolve({ stdout: '', stderr: '', exitCode: 0 }),
    )
    expect(
      await collect(readJournalNdjson(handle, { journal: { runId: 'r1' } })),
    ).toEqual([{ a: 1 }])
  })

  it('a failing rm does not mask the real non-zero-exit error', async () => {
    const { handle } = timelineHandle([`${EXIT(7)}\n`], (command) =>
      command.startsWith('rm -f')
        ? Promise.reject(new Error('rm: /tmp: read-only file system'))
        : Promise.resolve({ stdout: '', stderr: '', exitCode: 0 }),
    )
    await expect(
      collect(readJournalNdjson(handle, { journal: { runId: 'r1' } })),
    ).rejects.toThrow(/exited with code 7/)
  })

  it('a failing sidecar read still throws the exit-code error, without stderr', async () => {
    const { handle } = timelineHandle([`${EXIT(7)}\n`], (command) =>
      command.startsWith('tail')
        ? Promise.reject(new Error('exec unavailable'))
        : Promise.resolve({ stdout: '', stderr: '', exitCode: 0 }),
    )
    await expect(
      collect(readJournalNdjson(handle, { journal: { runId: 'r1' } })),
    ).rejects.toThrow(/^Agent process exited with code 7$/)
  })

  it('a corrupt sidecar frame still throws the exit-code error', async () => {
    // `decodeBase64Stream` fails loud on a mid-quantum remainder. That must not
    // replace the agent's failure with a decoding failure.
    const { handle } = timelineHandle([`${EXIT(7)}\n`], (command) =>
      Promise.resolve({
        stdout: command.startsWith('tail') ? 'aaaaa' : '',
        stderr: '',
        exitCode: 0,
      }),
    )
    await expect(
      collect(readJournalNdjson(handle, { journal: { runId: 'r1' } })),
    ).rejects.toThrow(/^Agent process exited with code 7$/)
  })

  it('bounds the attached stderr the same way the unjournaled path does', async () => {
    const { handle } = timelineHandle([`${EXIT(7)}\n`], (command) =>
      Promise.resolve({
        stdout: command.startsWith('tail') ? stderrFrame('x'.repeat(4000)) : '',
        stderr: '',
        exitCode: 0,
      }),
    )
    const error = await collect(
      readJournalNdjson(handle, { journal: { runId: 'r1' } }),
    ).catch((cause: unknown) => cause)
    if (!(error instanceof Error)) throw new Error('expected a thrown Error')
    expect(error.message).toHaveLength(
      'Agent process exited with code 7: '.length + 1000,
    )
  })
})

describe('a late takeover after journal cleanup', () => {
  it('is safe by construction: alignment reads the event log, not the journal', () => {
    // The ordering argument only holds if nothing downstream of terminal needs
    // the journal. `alignToStoredLog` is that downstream step, and its input is
    // the stored log: it takes no SandboxHandle and no JournalPaths, and reads
    // the delivered prefix with `durability.snapshot()`. Asserted against the
    // source so a future edit that reaches for the journal breaks here.
    const source = readFileSync(
      new URL('../src/align.ts', import.meta.url),
      'utf8',
    )
    expect(source).toContain('options.durability.snapshot()')
    for (const forbidden of [
      'paths.journal',
      'JournalPaths',
      'SandboxHandle',
      'readJournal',
      'journalReadCommand',
      'journalFollowCommand',
      "from './journal",
    ]) {
      expect(source).not.toContain(forbidden)
    }
  })

  it('re-aligns a replayed prefix from the stored log with zero sandbox access', async () => {
    // End to end: a run reaches its sentinel and its journal is deleted, and a
    // successor host can still suppress the delivered prefix and forward only
    // the remainder — using the log alone.
    const { handle, timeline } = timelineHandle([`{"a":1}\n${EXIT(0)}\n`])
    await collect(readJournalNdjson(handle, { journal: { runId: 'r1' } }))
    expect(timeline).toContain(`exec:${journalCleanupCommand(R1)}`)

    const durability = memoryStream(
      new Request('http://test.local/api/chat?runId=runner-cleanup-takeover', {
        method: 'POST',
      }),
    )
    const chunk = (delta: string): StreamChunk => ({
      type: EventType.TEXT_MESSAGE_CONTENT,
      messageId: 'm1',
      delta,
      timestamp: 1,
    })
    await durability.append([chunk('a')])
    const forwarded: Array<StreamChunk> = []
    for await (const out of alignToStoredLog(
      (async function* () {
        yield chunk('a')
        yield chunk('b')
      })(),
      { durability },
    )) {
      forwarded.push(out)
    }
    expect(forwarded).toEqual([chunk('b')])
  })
})

describe('spawnNdjson with journaling', () => {
  it('starts the agent journaled and reads the journal back, one code path', async () => {
    const { handle, commands } = scriptedHandle([
      [], // the agent spawn
      [`{"a":1}\n${EXIT(0)}\n`], // the tail spawn
    ])
    expect(
      await collect(spawnNdjson(handle, 'agent', { journal: { runId: 'r1' } })),
    ).toEqual([{ a: 1 }])
    expect(commands[0]).toContain(`>> '/tmp/tanstack-runs/r1.ndjson'`)
    expect(commands[1]).toContain(
      `tail -c +1 -f '/tmp/tanstack-runs/r1.ndjson'`,
    )
  })

  it('skips the agent spawn when attaching to a run already in flight', async () => {
    const { handle, commands } = scriptedHandle([[`${EXIT(0)}\n`]])
    await collect(
      spawnNdjson(handle, 'agent', { journal: { runId: 'r1', attach: true } }),
    )
    // Three commands, none of them an agent: the attach preflight's `test -f`
    // (which `scriptedHandle`'s exec answers with exit 0, i.e. "the journal is
    // already there"), the tail, then the cleanup `rm` the terminal sentinel
    // triggers. The agent is already running elsewhere.
    expect(commands).toHaveLength(3)
    expect(commands[0]).toBe(journalExistsCommand(R1))
    expect(commands[1]).toContain('tail -c +1 -f')
    expect(commands[2]).toBe(journalCleanupCommand(R1))
    expect(commands.some((command) => command.includes('agent'))).toBe(false)
  })

  it('keeps the unjournaled path byte-identical when no journal option is passed', async () => {
    const handle = handleSpawning(['{"a":1}\n'])
    expect(await collect(spawnNdjson(handle, 'agent'))).toEqual([{ a: 1 }])
  })
})
