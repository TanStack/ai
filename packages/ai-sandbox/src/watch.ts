/**
 * Sandbox file-event hooks — observe create / change / delete of files inside a
 * sandbox (e.g. as an in-sandbox agent edits the workspace).
 *
 * Provider-agnostic: coded against the {@link SandboxHandle} contract only.
 * Two mechanisms, auto-selected:
 *
 * - **Native** — when a provider implements the optional `fs.watch` seam
 *   (local-process does, via Node `fs.watch`), OS events drive the feed with low
 *   latency.
 * - **Exec-poll** — otherwise (Docker, Cloudflare, any exec-only provider), a
 *   single `find … -printf` snapshot of `mtime\tsize\tpath` is taken every
 *   `intervalMs` and diffed. Works on any Linux container with GNU findutils
 *   (true for `node:*` / debian images) with no extra deps or image changes.
 *
 * The feed intentionally rides only the portable surface, so the same
 * `watchWorkspace` call behaves identically across providers.
 */
import { DEFAULT_WORKSPACE_ROOT } from './bootstrap'
import type { SandboxHandle } from './contracts'
import type { SandboxFileEvent } from '@tanstack/ai'

export type { SandboxFileEvent } from '@tanstack/ai'
/** @deprecated alias retained for the low-level watch API. */
export type FileEvent = SandboxFileEvent
export type FileEventType = SandboxFileEvent['type']

export interface WatchOptions {
  /** Called for every observed file event. */
  onEvent: (event: SandboxFileEvent) => void
  /** Workspace root to watch. Defaults to `/workspace`. */
  root?: string
  /** Poll interval for the exec-poll fallback, in ms. Defaults to 700. */
  intervalMs?: number
  /**
   * Directory-name fragments to ignore (a path containing `/<entry>/` is
   * skipped). Defaults to `['.git', 'node_modules']`.
   */
  ignore?: Array<string>
  /** Stop watching when this signal aborts. */
  signal?: AbortSignal
}

export interface SandboxWatchHandle {
  /** Stop the watcher and release its resources. */
  stop: () => Promise<void>
}

const DEFAULT_INTERVAL_MS = 700
const DEFAULT_IGNORE = ['.git', 'node_modules']

/** POSIX single-quote escape for embedding values in a shell command. */
function q(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

/**
 * Diff two file snapshots (`Map<path, signature>`, signature = `mtime\tsize`).
 * Pure — the heart of the exec-poll path, unit-tested in isolation.
 */
export function diffSnapshots(
  prev: Map<string, string>,
  next: Map<string, string>,
  timestamp: number,
): Array<SandboxFileEvent> {
  const events: Array<SandboxFileEvent> = []
  for (const [path, sig] of next) {
    const before = prev.get(path)
    if (before === undefined) events.push({ type: 'create', path, timestamp })
    else if (before !== sig) events.push({ type: 'change', path, timestamp })
  }
  for (const path of prev.keys()) {
    if (!next.has(path)) events.push({ type: 'delete', path, timestamp })
  }
  return events
}

/**
 * Build the `find` command that prints `mtime\tsize\tpath` for every file.
 * Searches `.` (relative to the exec `cwd`) rather than an absolute root: a
 * provider's `exec` maps only `cwd` onto the real filesystem, not literal path
 * arguments, so `find <virtual-root>` would look at a non-existent host path on
 * mapped-root providers (e.g. local-process). Emitted `%p` values are
 * root-normalized in {@link parseFindOutput}.
 */
function buildFindCommand(ignore: Array<string>): string {
  const prunes = ignore
    .map((entry) => `-not -path ${q(`*/${entry}/*`)}`)
    .join(' ')
  return `find . -type f ${prunes} -printf '%T@\\t%s\\t%p\\n'`
}

/**
 * Parse `find -printf` output into a `Map<path, signature>`. `find .` prints
 * paths like `./sub/file`; map them back under `root` so event paths match the
 * native-watch shape (`<root>/sub/file`).
 */
function parseFindOutput(stdout: string, root: string): Map<string, string> {
  const base = root.replace(/\/+$/, '')
  const snapshot = new Map<string, string>()
  for (const line of stdout.split('\n')) {
    if (line === '') continue
    const firstTab = line.indexOf('\t')
    const secondTab = line.indexOf('\t', firstTab + 1)
    if (firstTab === -1 || secondTab === -1) continue
    const mtime = line.slice(0, firstTab)
    const size = line.slice(firstTab + 1, secondTab)
    const rel = line.slice(secondTab + 1).replace(/^\.\/?/, '')
    const path = rel === '' ? base : `${base}/${rel}`
    snapshot.set(path, `${mtime}\t${size}`)
  }
  return snapshot
}

/** Whether a path should be ignored (contains a `/<entry>/` fragment). */
function isIgnored(path: string, ignore: Array<string>): boolean {
  return ignore.some((entry) => path.includes(`/${entry}/`))
}

/**
 * Start watching a sandbox workspace for file events. Picks the native
 * `fs.watch` fast-path when the provider advertises it, otherwise polls via
 * `find`. Returns a handle whose `stop()` tears everything down.
 */
export async function watchWorkspace(
  handle: SandboxHandle,
  options: WatchOptions,
): Promise<SandboxWatchHandle> {
  const root = options.root ?? DEFAULT_WORKSPACE_ROOT
  const ignore = options.ignore ?? DEFAULT_IGNORE
  const intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS

  // Already aborted before we start — don't begin any async work.
  if (options.signal?.aborted) return { stop: () => Promise.resolve() }

  if (handle.fs.watch) {
    return startNativeWatch(handle, { ...options, root, ignore })
  }
  return startPollWatch(handle, { ...options, root, ignore, intervalMs })
}

/** Native fs.watch path: OS events, disambiguated against a known-path set. */
async function startNativeWatch(
  handle: SandboxHandle,
  options: WatchOptions & { root: string; ignore: Array<string> },
): Promise<SandboxWatchHandle> {
  const { onEvent, root, ignore } = options
  const watch = handle.fs.watch
  if (!watch) throw new Error('native watch is unavailable on this provider')
  // Seed the set of existing files so the first event per path is classified
  // correctly (create vs change).
  const known = await collectPaths(handle, root, ignore)

  const subscription = await watch(root, (raw) => {
    const path = raw.path
    if (isIgnored(path, ignore)) return
    void (async () => {
      const exists = await handle.fs.exists(path)
      const timestamp = Date.now()
      if (!exists) {
        if (known.delete(path)) onEvent({ type: 'delete', path, timestamp })
        return
      }
      if (known.has(path)) onEvent({ type: 'change', path, timestamp })
      else {
        known.add(path)
        onEvent({ type: 'create', path, timestamp })
      }
    })().catch(() => undefined)
  })

  const onAbort = (): void => void subscription.stop().catch(() => undefined)
  options.signal?.addEventListener('abort', onAbort, { once: true })
  // The signal may have aborted during the awaits above (the once-listener
  // would have missed it) — tear down now if so.
  if (options.signal?.aborted) void subscription.stop().catch(() => undefined)

  return {
    stop: async () => {
      options.signal?.removeEventListener('abort', onAbort)
      await subscription.stop()
    },
  }
}

/** Exec-poll path: snapshot `find -printf` on an interval and diff. */
async function startPollWatch(
  handle: SandboxHandle,
  options: WatchOptions & {
    root: string
    ignore: Array<string>
    intervalMs: number
  },
): Promise<SandboxWatchHandle> {
  const { onEvent, root, ignore, intervalMs } = options
  const command = buildFindCommand(ignore)
  const controller = new AbortController()

  const snapshot = async (): Promise<Map<string, string>> => {
    const result = await handle.process.exec(command, {
      cwd: root,
      signal: controller.signal,
    })
    return result.exitCode === 0
      ? parseFindOutput(result.stdout, root)
      : new Map<string, string>()
  }

  let previous = await snapshot()
  const state = { running: true }

  const tick = async (): Promise<void> => {
    if (!state.running) return
    try {
      const next = await snapshot()
      for (const event of diffSnapshots(previous, next, Date.now())) {
        onEvent(event)
      }
      previous = next
    } catch {
      // transient exec failure (e.g. mid-teardown) — try again next tick
    }
  }

  const timer = setInterval(() => void tick(), intervalMs)
  // Don't keep the event loop alive on the watcher alone.
  if (typeof timer.unref === 'function') timer.unref()

  const stop = (): Promise<void> => {
    if (state.running) {
      state.running = false
      clearInterval(timer)
      controller.abort()
      options.signal?.removeEventListener('abort', onAbort)
    }
    return Promise.resolve()
  }
  const onAbort = (): void => void stop()
  options.signal?.addEventListener('abort', onAbort, { once: true })
  // The signal may have aborted during the initial `await snapshot()` above
  // (the once-listener would have missed it) — tear down now if so.
  if (options.signal?.aborted) void stop()

  return { stop }
}

/** Recursively collect file paths under `root`, honoring `ignore`. */
async function collectPaths(
  handle: SandboxHandle,
  root: string,
  ignore: Array<string>,
): Promise<Set<string>> {
  const files = new Set<string>()
  const walk = async (dir: string): Promise<void> => {
    let entries: Awaited<ReturnType<SandboxHandle['fs']['list']>>
    try {
      entries = await handle.fs.list(dir)
    } catch {
      return
    }
    for (const entry of entries) {
      if (ignore.includes(entry.name)) continue
      if (entry.type === 'dir') await walk(entry.path)
      else files.add(entry.path)
    }
  }
  await walk(root)
  return files
}
