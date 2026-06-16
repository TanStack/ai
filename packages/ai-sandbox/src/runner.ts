/**
 * The reusable "run an agent CLI inside a sandbox and stream its events out"
 * primitive. Harness adapters (claude-code, codex, …) spawn their CLI via the
 * uniform {@link SandboxHandle} and consume newline-delimited JSON from stdout,
 * which they then translate into AG-UI StreamChunks.
 *
 * This is intentionally transport-minimal: a stdout NDJSON pipe. Multi-client
 * reconnect / replay belongs to the persistence/EventLog layer, not here.
 */
import type { ProcessOptions, SandboxHandle } from './contracts'

export interface SpawnNdjsonOptions extends ProcessOptions {
  /**
   * Called for each raw stdout line that is non-empty but fails JSON parsing
   * (e.g. a CLI banner). Defaults to ignoring it. Stderr is never parsed.
   */
  onNonJsonLine?: (line: string) => void
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

/**
 * Spawn `command` in the sandbox and yield each stdout line parsed as JSON.
 * Resolves the spawn handle's exit via `wait()` after stdout closes; a non-zero
 * exit with no events surfaced is the adapter's concern to detect.
 */
export async function* spawnNdjson(
  handle: SandboxHandle,
  command: string,
  options: SpawnNdjsonOptions = {},
): AsyncIterable<unknown> {
  const { onNonJsonLine, ...processOptions } = options
  const proc = await handle.process.spawn(command, processOptions)

  for await (const line of toLines(proc.stdout)) {
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

  await proc.wait()
}
