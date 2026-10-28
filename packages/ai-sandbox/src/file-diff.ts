import type { SandboxFileEvent, SandboxFileHookEvent } from '@tanstack/ai'
import type { InternalLogger } from '@tanstack/ai/adapter-internals'
import type { SandboxHandle } from './contracts'

/** Path relative to the repo/workspace root, POSIX form. */
function relTo(root: string, path: string): string {
  const prefix = root.endsWith('/') ? root : `${root}/`
  return path.startsWith(prefix) ? path.slice(prefix.length) : path
}

/**
 * POSIX single-quote escape for embedding a value in a shell command.
 */
function q(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

/**
 * Unified add-patch for a brand-new file, closely following the shape `git
 * diff` produces for an added file (`diff --git` header + `new file mode` +
 * `--- /dev/null` + `+++ b/<rel>`), so synthesized `create` diffs align with
 * the real `git diff` output emitted for `change` events. `rel` must be the
 * repo-root-relative POSIX path (like git's). Reproduces git's `\ No newline
 * at end of file` marker and the header-only form for a zero-byte file, so a
 * consumer applying the patch reconstructs the file byte-for-byte. It is not
 * byte-identical to git — it omits the `index <hash>..<hash>` line and always
 * writes the `+1,N` hunk count (git omits `,1`) — but both are valid
 * unified-diff and accepted by `git apply`/`patch`.
 */
function synthesizeAddPatch(rel: string, content: string): string {
  const header = `diff --git a/${rel} b/${rel}\nnew file mode 100644\n`
  // A zero-byte new file has no hunk in git's output — just the header.
  if (content === '') return header
  const hasFinalNewline = content.endsWith('\n')
  const lines = content.replace(/\n$/, '').split('\n')
  const body = lines.map((l) => `+${l}`).join('\n')
  return (
    header +
    `--- /dev/null\n` +
    `+++ b/${rel}\n` +
    `@@ -0,0 +1,${lines.length} @@\n` +
    body +
    (hasFinalNewline ? '\n' : '\n\\ No newline at end of file\n')
  )
}

/**
 * Wrap a raw {@link SandboxFileEvent} with lazy git-backed accessors bound to
 * the live handle. `baseSha` is the session baseline (`''` when the workspace
 * isn't a git repo). Never throws — every git/fs failure falls back to `''`
 * (or a synthesized add-patch), but is logged first via `logger` so a failure
 * is observable instead of silently becoming empty data.
 */
export function buildFileHookEvent(
  handle: SandboxHandle,
  root: string,
  baseSha: string,
  event: SandboxFileEvent,
  logger?: InternalLogger,
): SandboxFileHookEvent {
  const after = async (): Promise<string> => {
    if (event.type === 'delete') return ''
    try {
      return await handle.fs.read(event.path)
    } catch (error) {
      logger?.warn('sandbox after() failed to read file', {
        path: event.path,
        error,
      })
      return ''
    }
  }
  const before = async (): Promise<string> => {
    if (baseSha === '') return ''
    const rel = relTo(root, event.path)
    try {
      const res = await handle.process.exec(
        `git show ${q(baseSha)}:${q(rel)}`,
        { cwd: root },
      )
      if (res.exitCode === 0) return res.stdout
      // Non-zero exit is EXPECTED when the file didn't exist at the baseline
      // (a newly created file) — git exits 128 with "exists on disk, but not
      // in <sha>". Log under `sandbox` (off by default) rather than warn so a
      // create event's before() doesn't spam a warning on every new file.
      logger?.sandbox('before() git show non-zero exit', {
        path: event.path,
        exitCode: res.exitCode,
        stderr: res.stderr,
      })
      return ''
    } catch (error) {
      logger?.warn('sandbox before() git show failed', {
        path: event.path,
        error,
      })
      return ''
    }
  }
  // Empty `git diff` fallback: `git diff <sha> -- <path>` shows nothing for a
  // file git isn't tracking, so an untracked file (the common agent action —
  // and every subsequent edit to it, which arrives as a `change`, not just the
  // first `create`) yields empty stdout even though it has content. Synthesize
  // an add-patch, but ONLY when the file is genuinely untracked at the
  // baseline — an empty diff for a *tracked* file means "identical to
  // baseline", a real no-op that must stay empty. Presence at `baseSha`
  // distinguishes them, probed below via the `git show` EXIT CODE (NOT
  // `before()`'s `''`, which also means "git show threw" — see the inline note).
  // ponytail: reached only when `git diff` came back empty — the common case
  // for an untracked file (and every edit to it), rare for a tracked one. It
  // spends up to two extra subprocesses (`git check-ignore`, then `git show`)
  // plus one `after()` read per such event; both verdicts are invariant per
  // path across a run, but memoizing them would need cross-event state the
  // per-event accessor doesn't hold. Add a per-path cache in the watcher if
  // edit-burst latency matters.
  const synthesizeIfUntracked = async (rel: string): Promise<string> => {
    const content = await after()
    if (content === '') return '' // deleted / empty / unreadable — nothing to add
    // Don't expose the CONTENTS of a git-ignored file (`.env`, credentials,
    // build artifacts, …) in the diff feed. The file event still fires so
    // consumers are notified it changed — only its diff is withheld. A
    // force-added, ignored-yet-TRACKED file produces a non-empty `git diff`
    // above and never reaches here, so its real diff is unaffected.
    try {
      const ignored = await handle.process.exec(
        `git check-ignore -q -- ${q(rel)}`,
        { cwd: root },
      )
      // check-ignore: exit 0 ⇒ path is ignored; 1 ⇒ not ignored; 128 ⇒ error.
      if (ignored.exitCode === 0) {
        logger?.sandbox('sandbox diff() withheld for git-ignored file', {
          path: event.path,
        })
        return ''
      }
      if (ignored.exitCode !== 1) {
        // Not the expected "not ignored" (1) — a real check-ignore error (128:
        // corrupt repo, bad invocation). Same anomaly class as the throw below,
        // so `warn`. We still fall through and diff, so a broken probe never
        // silently withholds; but log it, or an error here would look exactly
        // like "not ignored" and could expose a would-be-withheld file's diff.
        logger?.warn('sandbox diff() git check-ignore non-zero exit', {
          path: event.path,
          exitCode: ignored.exitCode,
          stderr: ignored.stderr,
        })
      }
    } catch (error) {
      // check-ignore threw (git/exec broken) — same anomaly class as the other
      // git execs here, so `warn`. We fall through and diff as usual rather
      // than withhold, so a broken probe can't hide a legitimate diff.
      logger?.warn('sandbox diff() git check-ignore failed', {
        path: event.path,
        error,
      })
    }
    // Distinguish "absent at the baseline (untracked)" from "present at the
    // baseline" by the git-show EXIT CODE, not by before()'s `''` — which also
    // means "git show threw". Conflating a transient git-show failure with
    // untracked would fabricate a full-file add-patch for an unchanged tracked
    // file the agent never touched.
    try {
      const res = await handle.process.exec(
        `git show ${q(baseSha)}:${q(rel)}`,
        { cwd: root },
      )
      // exit 0 ⇒ tracked; `git diff` was already empty ⇒ identical to baseline
      // ⇒ genuine no-op.
      if (res.exitCode === 0) return ''
      // Non-zero is the EXPECTED "absent at baseline ⇒ untracked" case (exit
      // 128), but a genuine git-show error (bad object, corrupt repo, invalid
      // sha) also exits non-zero and would silently fabricate a full-file
      // add-patch. Log it under `sandbox` (like `before()` does) so a
      // persistent probe error is greppable, then fall back to synthesize.
      logger?.sandbox(
        'sandbox diff() tracked-ness probe non-zero exit (treating as untracked)',
        { path: event.path, exitCode: res.exitCode, stderr: res.stderr },
      )
      return synthesizeAddPatch(rel, content)
    } catch (error) {
      // Uncertain — don't fabricate a full-file add-patch on a probe failure.
      logger?.warn('sandbox diff() tracked-ness probe failed', {
        path: event.path,
        error,
      })
      return ''
    }
  }
  const diff = async (): Promise<string> => {
    if (baseSha === '') {
      if (event.type === 'delete') return ''
      return synthesizeAddPatch(relTo(root, event.path), await after())
    }
    // Pathspec must be relative to `root` (like `before()` above) — a bare
    // leading `/` (e.g. the virtual `/workspace/x.ts`) is resolved by git
    // against the filesystem root, not the repo root, and fails with
    // "fatal: Invalid path" whenever the real repo root differs from
    // `/workspace` (e.g. every local-process sandbox).
    const rel = relTo(root, event.path)
    try {
      const res = await handle.process.exec(
        `git diff ${q(baseSha)} -- ${q(rel)}`,
        {
          cwd: root,
        },
      )
      if (res.exitCode !== 0) {
        logger?.warn('sandbox diff() git diff non-zero exit', {
          path: event.path,
          exitCode: res.exitCode,
          stderr: res.stderr,
        })
        return ''
      }
      if (res.stdout !== '') return res.stdout
      return synthesizeIfUntracked(rel)
    } catch (error) {
      logger?.warn('sandbox diff() git diff failed', {
        path: event.path,
        error,
      })
      return ''
    }
  }
  return { ...event, before, after, diff }
}

export interface ResolvedFileEvents {
  enabled: boolean
  diff: boolean
}

/** Normalize the `fileEvents` option (`boolean | { diff?: boolean }`). */
export function resolveFileEvents(
  opt: boolean | { diff?: boolean } | undefined,
): ResolvedFileEvents {
  if (opt === false) return { enabled: false, diff: false }
  if (opt === undefined || opt === true) return { enabled: true, diff: false }
  return { enabled: true, diff: opt.diff === true }
}
