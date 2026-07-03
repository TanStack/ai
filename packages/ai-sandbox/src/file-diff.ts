import type { SandboxFileEvent, SandboxFileHookEvent } from '@tanstack/ai'
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

/** Minimal unified add-patch for a brand-new file (non-git workspaces). */
function synthesizeAddPatch(path: string, content: string): string {
  const lines = content === '' ? [] : content.replace(/\n$/, '').split('\n')
  const body = lines.map((l) => `+${l}`).join('\n')
  return `--- /dev/null\n+++ ${path}\n@@ -0,0 +1,${lines.length} @@\n${body}${body ? '\n' : ''}`
}

/**
 * Wrap a raw {@link SandboxFileEvent} with lazy git-backed accessors bound to
 * the live handle. `baseSha` is the session baseline (`''` when the workspace
 * isn't a git repo). Never throws.
 */
export function buildFileHookEvent(
  handle: SandboxHandle,
  root: string,
  baseSha: string,
  event: SandboxFileEvent,
): SandboxFileHookEvent {
  const after = async (): Promise<string> => {
    if (event.type === 'delete') return ''
    try {
      return await handle.fs.read(event.path)
    } catch {
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
      return res.exitCode === 0 ? res.stdout : ''
    } catch {
      return ''
    }
  }
  const diff = async (): Promise<string> => {
    if (baseSha === '') {
      if (event.type === 'delete') return ''
      return synthesizeAddPatch(event.path, await after())
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
      return res.exitCode === 0 ? res.stdout : ''
    } catch {
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
