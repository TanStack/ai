import type { SandboxFileEvent, SandboxFileHookEvent } from '@tanstack/ai'
import type { InternalLogger } from '@tanstack/ai/adapter-internals'
import type { SandboxHandle } from './contracts'

/** Path relative to the repo/workspace root, POSIX form. */
function relTo(root: string, path: string): string {
  const prefix = root.endsWith('/') ? root : `${root}/`
  return path.startsWith(prefix) ? path.slice(prefix.length) : path
}

function q(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

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
  const synthesizeIfUntracked = async (rel: string): Promise<string> => {
    const content = await after()
    if (content === '') return '' // deleted / empty / unreadable — nothing to add
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
        logger?.warn('sandbox diff() git check-ignore non-zero exit', {
          path: event.path,
          exitCode: ignored.exitCode,
          stderr: ignored.stderr,
        })
      }
    } catch (error) {
      logger?.warn('sandbox diff() git check-ignore failed', {
        path: event.path,
        error,
      })
    }
    try {
      const res = await handle.process.exec(
        `git show ${q(baseSha)}:${q(rel)}`,
        { cwd: root },
      )
      // exit 0 ⇒ tracked; `git diff` was already empty ⇒ identical to baseline
      // ⇒ genuine no-op.
      if (res.exitCode === 0) return ''
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
  const isDefaultFileEvents = opt === undefined || opt === true
  if (isDefaultFileEvents) return { enabled: true, diff: false }
  return { enabled: true, diff: opt.diff === true }
}
