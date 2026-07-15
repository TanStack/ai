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
import type { InternalLogger } from '@tanstack/ai/adapter-internals'

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
  /**
   * Optional logger. When present, a failed `find` poll (non-zero exit or a
   * thrown exec) is logged instead of silently degrading the snapshot — the
   * failure mode a plain exec-poll watcher hides.
   */
  logger?: InternalLogger
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
  const { onEvent, root, ignore, logger } = options
  const watch = handle.fs.watch
  if (!watch) throw new Error('native watch is unavailable on this provider')
  // Seed the set of existing files so the first event per path is classified
  // correctly (create vs change).
  const seed = await collectPaths(handle, root, ignore, logger)
  const known = seed.files
  // If the ROOT list failed, `known` is untrustworthy — every pre-existing
  // file would misclassify as `create` on its first edit. Re-seed lazily on
  // the next event(s): by the time real activity arrives the fs has usually
  // recovered, and re-listing then establishes the baseline. Dedupe concurrent
  // re-seeds behind a single in-flight promise.
  // ponytail: a file genuinely CREATED in the narrow window between the failed
  // seed and the first event gets picked up by the re-seed and so mislabels as
  // `change` once. That's strictly better than the whole-run mislabel a
  // never-recovered empty seed causes, and `diff()` is correct regardless.
  let seeded = seed.rootOk
  let reseeding: Promise<void> | null = null
  const ensureSeeded = (): Promise<void> => {
    if (seeded) return Promise.resolve()
    if (!reseeding) {
      reseeding = collectPaths(handle, root, ignore, logger).then((r) => {
        if (r.rootOk) {
          for (const p of r.files) known.add(p)
          seeded = true
          logger?.sandbox(
            'sandbox watch: re-seeded after failed initial seed',
            {
              root,
            },
          )
        }
        reseeding = null
      })
    }
    return reseeding
  }

  const subscription = await watch(root, (raw) => {
    const path = raw.path
    if (isIgnored(path, ignore)) return
    void (async () => {
      await ensureSeeded()
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
    })().catch((error: unknown) => {
      // A failed classify (e.g. `fs.exists` threw) drops this file's event —
      // log it so a missing diff isn't silent (the whole point of the watcher).
      logger?.warn('sandbox watch: native event classify failed', {
        path,
        error,
      })
    })
  })

  // A failed `subscription.stop()` can leak an OS-level watch — log rather
  // than swallow it silently.
  const logStopFailure = (error: unknown): void =>
    logger?.warn('sandbox watch: native subscription.stop() failed', {
      root,
      error,
    })
  const onAbort = (): void => void subscription.stop().catch(logStopFailure)
  options.signal?.addEventListener('abort', onAbort, { once: true })
  // The signal may have aborted during the awaits above (the once-listener
  // would have missed it) — tear down now if so.
  if (options.signal?.aborted) void subscription.stop().catch(logStopFailure)

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
  const { onEvent, root, ignore, intervalMs, logger } = options
  const command = buildFindCommand(ignore)
  const controller = new AbortController()

  // A poll result: the parsed snapshot plus whether `find` completed cleanly.
  // `null` means the poll produced no usable output at all (thrown exec, or a
  // non-zero exit with empty stdout) — callers preserve the previous snapshot.
  // Collapsing a failed poll to `{}` would make the next diff fabricate a
  // `delete` for every tracked file (and a `create` for each on recovery) —
  // one transient `find` blip would fan a phantom storm out to hooks/stream.
  interface Poll {
    map: Map<string, string>
    /** `false` when `find` exited non-zero but still printed rows (partial). */
    complete: boolean
  }
  // Escalate a steady-state poll throw to `warn` after this many in a row.
  const STEADY_STATE_THROW_WARN_AFTER = 3
  let consecutiveThrows = 0
  const snapshot = async (isInitial = false): Promise<Poll | null> => {
    let result
    try {
      result = await handle.process.exec(command, {
        cwd: root,
        signal: controller.signal,
      })
      consecutiveThrows = 0 // exec returned (any exit code) — the seam is alive
    } catch (error) {
      // Thrown exec — container not ready, `find` seam rejects, or a
      // mid-teardown abort. Treat as a failed poll so BOTH the initial seed
      // and every tick preserve `previous` instead of rejecting setup (which
      // would crash the run and leak the sandbox) or the interval.
      if (isInitial) {
        // The INITIAL poll can't be a teardown (a pre-aborted signal is guarded
        // in `watchWorkspace`), so a throw here is an unambiguous anomaly (`find`
        // missing, container never ready) that leaves the watcher dead for the
        // whole run — surface it at `warn`.
        logger?.warn('sandbox watch: initial `find` poll threw', {
          root,
          error,
        })
      } else if (controller.signal.aborted) {
        // Mid-teardown abort — expected, stay quiet.
        logger?.sandbox('sandbox watch: `find` poll threw during teardown', {
          root,
          error,
        })
      } else {
        // Steady-state throw while NOT tearing down. One is usually a transient
        // blip (→ `sandbox`), but a run of them means the exec seam is wedged:
        // every poll returns null and the watcher emits nothing for the rest of
        // the run. That silent-death case escalates to `warn` (on by default).
        consecutiveThrows += 1
        if (consecutiveThrows >= STEADY_STATE_THROW_WARN_AFTER) {
          logger?.warn('sandbox watch: `find` poll threw repeatedly', {
            root,
            error,
            consecutiveThrows,
          })
        } else {
          logger?.sandbox('sandbox watch: `find` poll threw', { root, error })
        }
      }
      return null
    }
    if (result.exitCode === 0) {
      return { map: parseFindOutput(result.stdout, root), complete: true }
    }
    // Non-zero exit doesn't mean "no data": GNU `find` exits >0 on the first
    // permission-denied entry it hits mid-traversal (common in containers, and
    // the ignore list is a `-not -path` filter, not `-prune`, so `find` still
    // descends into unreadable dirs) yet still prints every readable file. Use
    // that partial output — marked `complete: false` so the tick merges rather
    // than diffs it — instead of blinding the watcher for the whole run. Only a
    // non-zero exit with NO output is a truly failed poll.
    if (result.stdout !== '') {
      logger?.sandbox(
        'sandbox watch: `find` non-zero exit with partial output',
        { root, exitCode: result.exitCode, stderr: result.stderr },
      )
      return { map: parseFindOutput(result.stdout, root), complete: false }
    }
    logger?.warn('sandbox watch: `find` poll exited non-zero with no output', {
      root,
      exitCode: result.exitCode,
      stderr: result.stderr,
    })
    return null
  }

  // `null` until the first poll that yields usable output. A failed INITIAL
  // poll must NOT seed an empty baseline — the first successful poll would then
  // diff against `{}` and fabricate a `create` for every pre-existing file. So
  // the first non-null snapshot is adopted as the baseline WITHOUT diffing.
  let previous: Map<string, string> | null = null
  // Whether `previous` was established from a COMPLETE poll. A baseline seeded
  // from a PARTIAL poll is provisional — files unreadable during that poll are
  // absent from it and would later fabricate `create`s when they recover — so
  // the first complete poll re-baselines without diffing.
  let seededFromComplete = false
  {
    const poll = await snapshot(true)
    if (poll) {
      previous = poll.map
      seededFromComplete = poll.complete
    }
  }
  const state = { running: true }

  const tick = async (): Promise<void> => {
    if (!state.running) return
    try {
      const poll = await snapshot()
      // Failed poll — keep `previous` and retry next tick (see `snapshot`).
      if (poll === null) return
      if (previous === null) {
        // First usable snapshot after a failed initial poll — seed, don't diff.
        previous = poll.map
        seededFromComplete = poll.complete
        return
      }
      if (!seededFromComplete && poll.complete) {
        // First complete poll after a provisional (partial) seed — re-baseline
        // WITHOUT diffing, so files merely unreadable at seed time don't
        // fabricate `create`s. (Real creates during this degraded-startup
        // window are missed — an acceptable trade for not fabricating events.)
        logger?.sandbox(
          'sandbox watch: re-baselined after provisional partial seed',
          { root },
        )
        previous = poll.map
        seededFromComplete = true
        return
      }
      // A partial (non-`complete`) poll can't distinguish "deleted" from
      // "transiently unreadable this poll", so MERGE it over `previous`: pick
      // up new/changed files without fabricating a `delete` for a path this
      // poll simply couldn't see. A real deletion still surfaces on the next
      // complete poll.
      const next = poll.complete
        ? poll.map
        : new Map([...previous, ...poll.map])
      for (const event of diffSnapshots(previous, next, Date.now())) {
        onEvent(event)
      }
      previous = next
    } catch (error) {
      // Defensive: a throw from diff dispatch — preserve `previous`, retry.
      logger?.sandbox('sandbox watch: tick failed', { root, error })
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

/**
 * Recursively collect file paths under `root`, honoring `ignore`. `rootOk` is
 * `false` when the ROOT `list` itself failed — the seed is then untrustworthy
 * (empty/partial), which the native watcher uses to trigger a lazy re-seed. A
 * failed *subdirectory* list is logged but doesn't flip `rootOk` (its files are
 * simply absent, a smaller misclassification surface).
 */
async function collectPaths(
  handle: SandboxHandle,
  root: string,
  ignore: Array<string>,
  logger?: InternalLogger,
): Promise<{ files: Set<string>; rootOk: boolean }> {
  const files = new Set<string>()
  let rootOk = true
  const walk = async (dir: string, isRoot: boolean): Promise<void> => {
    let entries: Awaited<ReturnType<SandboxHandle['fs']['list']>>
    try {
      entries = await handle.fs.list(dir)
    } catch (error) {
      // A dir we can't list is seeded as empty, so its existing files would
      // later misclassify as `create` on first edit — log rather than hide it.
      if (isRoot) rootOk = false
      logger?.warn('sandbox watch: failed to list directory while seeding', {
        dir,
        error,
      })
      return
    }
    for (const entry of entries) {
      if (ignore.includes(entry.name)) continue
      if (entry.type === 'dir') await walk(entry.path, false)
      else files.add(entry.path)
    }
  }
  await walk(root, true)
  return { files, rootOk }
}
