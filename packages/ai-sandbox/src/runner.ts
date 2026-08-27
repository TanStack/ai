import {
  journalCleanupCommand,
  journalPaths,
  journalStderrReadCommand,
  journaledCommand,
  parseExitSentinel,
} from './journal'
import { readJournal } from './journal-reader'
import { decodeBase64Stream } from './journal-bytes'
import { awaitAttachableJournal } from './attach-preflight'
import type { JournalPaths } from './journal'
import type { ProcessOptions, SandboxHandle } from './contracts'
import type { RunStore } from '@tanstack/ai'

export interface SpawnNdjsonOptions extends ProcessOptions {
  onNonJsonLine?: (line: string) => void
  input?: string
  journal?: JournalOptions
}

/** Journaling configuration for {@link spawnNdjson}. */
export interface JournalOptions {
  /** Run id the journal path is derived from. Must match across hosts. */
  runId: string
  /** Journal directory. Defaults to `/tmp/tanstack-runs`. */
  dir?: string
  attach?: boolean
  /** Poll interval for providers that cannot follow. */
  pollIntervalMs?: number
  runs?: RunStore
  attachWaitMs?: number
}

type JournaledOptions = SpawnNdjsonOptions & { journal: JournalOptions }

function isJournaled(options: SpawnNdjsonOptions): options is JournaledOptions {
  return options.journal !== undefined
}

function resolvePaths(options: JournaledOptions) {
  return journalPaths(options.journal.runId, options.journal.dir)
}

function toProcessOptions(options: SpawnNdjsonOptions): ProcessOptions {
  const { onNonJsonLine, input, journal, ...rest } = options
  void onNonJsonLine
  void input
  void journal
  return rest
}

function toJournaledSpawnOptions(options: JournaledOptions): ProcessOptions {
  const { signal, ...rest } = toProcessOptions(options)
  void signal
  return rest
}

/** Split a stream of arbitrary string chunks into complete lines. */
export async function* toLines(
  chunks: AsyncIterable<string>,
): AsyncIterable<string> {
  let buffer = ''
  for await (const chunk of chunks) {
    buffer += chunk
    let newlineIndex = buffer.indexOf('\n')
    while (newlineIndex !== -1) {
      const line = buffer.slice(0, newlineIndex)
      buffer = buffer.slice(newlineIndex + 1)
      yield line
      newlineIndex = buffer.indexOf('\n')
    }
  }
  if (buffer.length > 0) yield buffer
}

export async function startJournaledAgent(
  handle: SandboxHandle,
  command: string,
  options: JournaledOptions,
): Promise<void> {
  const paths = resolvePaths(options)
  const proc = await handle.process.spawn(
    journaledCommand(command, paths),
    toJournaledSpawnOptions(options),
  )
  if (options.input !== undefined) {
    await proc.stdin.write(options.input)
    await proc.stdin.end()
  }
}

/** Chars of stderr attached to a non-zero-exit error, on both paths. */
const STDERR_ERROR_CHARS = 1000

async function* singleValue(value: string): AsyncIterable<string> {
  yield value
}

async function readStderrTail(
  handle: SandboxHandle,
  paths: JournalPaths,
): Promise<string> {
  try {
    const result = await handle.process.exec(journalStderrReadCommand(paths))
    const decoder = new TextDecoder()
    let text = ''
    const decodedChunks = decodeBase64Stream(singleValue(result.stdout))
    for await (const bytes of decodedChunks) {
      text += decoder.decode(bytes, { stream: true })
    }
    text += decoder.decode()
    return text.trim()
  } catch {
    return ''
  }
}

async function cleanupJournal(
  handle: SandboxHandle,
  paths: JournalPaths,
): Promise<void> {
  try {
    await handle.process.exec(journalCleanupCommand(paths))
  } catch {}
}

export async function* readJournalNdjson(
  handle: SandboxHandle,
  options: JournaledOptions,
): AsyncIterable<unknown> {
  const paths = resolvePaths(options)
  if (options.journal.attach === true) {
    await awaitAttachableJournal(handle, {
      paths,
      runId: options.journal.runId,
      ...(options.journal.runs === undefined
        ? {}
        : { runs: options.journal.runs }),
      ...(options.journal.attachWaitMs === undefined
        ? {}
        : { waitMs: options.journal.attachWaitMs }),
      ...(options.signal === undefined ? {} : { signal: options.signal }),
    })
  }
  let exitCode: number | undefined
  const journalLines = readJournal(handle, {
    paths,
    fromByte: 0,
    runId: options.journal.runId,
    ...(options.signal === undefined ? {} : { signal: options.signal }),
    ...(options.journal.pollIntervalMs === undefined
      ? {}
      : { pollIntervalMs: options.journal.pollIntervalMs }),
    ...(options.journal.attachWaitMs === undefined
      ? {}
      : { firstByteTimeoutMs: options.journal.attachWaitMs }),
  })
  for await (const { line } of journalLines) {
    const trimmed = line.trim()
    if (trimmed === '') continue
    const sentinel = parseExitSentinel(trimmed, paths)
    if (sentinel !== null) {
      exitCode = sentinel
      break
    }
    let parsed: unknown
    try {
      parsed = JSON.parse(trimmed)
    } catch {
      options.onNonJsonLine?.(trimmed)
      continue
    }
    yield parsed
  }

  if (exitCode === undefined) {
    if (options.signal?.aborted === true) return
    throw new Error(
      `Agent journal stream for run ${options.journal.runId} ended without an exit sentinel ` +
        `(${paths.journal}). The run was NOT observed to finish: the tail was torn down, ` +
        `the sandbox went away, or the agent's shell died before writing its sentinel. ` +
        `Both journal files are left in place for a successor host.`,
    )
  }

  const stderr = exitCode === 0 ? '' : await readStderrTail(handle, paths)
  await cleanupJournal(handle, paths)
  if (exitCode !== 0) {
    throw new Error(
      `Agent process exited with code ${exitCode}` +
        (stderr ? `: ${stderr.slice(0, STDERR_ERROR_CHARS)}` : ''),
    )
  }
}

export async function* spawnNdjson(
  handle: SandboxHandle,
  command: string,
  options: SpawnNdjsonOptions = {},
): AsyncIterable<unknown> {
  if (isJournaled(options)) {
    if (options.journal.attach !== true) {
      await startJournaledAgent(handle, command, options)
    }
    yield* readJournalNdjson(handle, options)
    return
  }

  const { onNonJsonLine, input, ...processOptions } = options
  const proc = await handle.process.spawn(command, processOptions)

  if (input !== undefined) {
    await proc.stdin.write(input)
    await proc.stdin.end()
  }

  const stderrChunks: Array<string> = []
  const stderrDrained = (async () => {
    try {
      for await (const chunk of proc.stderr) stderrChunks.push(chunk)
    } catch {
      // stderr stream torn down — use whatever was captured
    }
  })()

  const stdoutLines = toLines(proc.stdout)
  for await (const line of stdoutLines) {
    const trimmed = line.trim()
    if (trimmed === '') continue
    let parsed: unknown
    try {
      parsed = JSON.parse(trimmed)
    } catch {
      onNonJsonLine?.(trimmed)
      continue
    }
    yield parsed
  }

  const exitCode = await proc.wait()
  await stderrDrained
  if (exitCode !== 0) {
    const stderr = stderrChunks.join('').trim()
    throw new Error(
      `Agent process exited with code ${exitCode}` +
        (stderr ? `: ${stderr.slice(0, STDERR_ERROR_CHARS)}` : ''),
    )
  }
}
