import { unifiedDiff } from '../../utils'
import { pathsOf, readText } from './backend'
import { FileChanged } from './events'
import type { ToolEnv, WorkspaceBackend } from './backend'

/** A patch over this many bytes is not sent. */
export const MAX_PATCH_BYTES = 256 * 1024
/** A file over this many bytes gets no patch. */
export const MAX_DIFF_FILE_BYTES = 1024 * 1024
/** A NUL in this many first bytes marks a binary file. */
const BINARY_CHECK_BYTES = 8 * 1024
/** The counts of an event without a patch. */
const NO_PATCH = { additions: 0, deletions: 0 }

/**
 * The text of a file for a diff: `undefined` when no file is there, and
 * `null` when the text is not known.
 */
export type DiffText = string | null | undefined

/**
 * The text of the file at `path`, for {@link reportChange}: `undefined` when
 * no file is there, and `null` when the file is over 1 MiB or cannot be
 * read. It never throws.
 */
export async function readForDiff(backend: WorkspaceBackend, path: string) {
  try {
    const info = await backend.stat(path)
    if (info === undefined) return undefined
    if (info.type !== 'file' || info.size > MAX_DIFF_FILE_BYTES) return null
    return await readText(backend, path)
  } catch {
    return null
  }
}

/** True for text that can be in a patch: at most 1 MiB, and not binary. */
const isPlainText = (text: string) =>
  Buffer.byteLength(text) <= MAX_DIFF_FILE_BYTES &&
  // A character is one byte or more, so this covers the first 8 KiB.
  !text.slice(0, BINARY_CHECK_BYTES).includes('\0')

/**
 * True when the file at `full` must not be in a patch: a `.env` file in any
 * permission mode (the snapshots never store them either), or a file that
 * the permission rules protect.
 */
async function isProtected(env: ToolEnv, full: string) {
  const { basename, dirname } = pathsOf(env.backend)
  const name = basename(full)
  if (name.startsWith('.env')) return true
  const isIn = await env.protectedIn?.(dirname(full))
  return isIn?.(name) === true
}

/**
 * The patch of a change and its counts, with the paths from the root. Only
 * the counts 0 when the change gets no patch: a text is not known, binary,
 * or over 1 MiB, a path is a `.env` file or the permission rules protect
 * it, or the patch is over 256 KiB.
 */
async function patchOf(
  env: ToolEnv,
  change: { path: string; from?: string; before: DiffText; after: DiffText },
) {
  const { path, from, before, after } = change
  if (before === null || after === null) return NO_PATCH
  const isPlain = [before, after].every(
    (text) => text === undefined || isPlainText(text),
  )
  if (!isPlain) return NO_PATCH
  const fulls = from === undefined ? [path] : [path, from]
  for (const full of fulls) {
    if (await isProtected(env, full)) return NO_PATCH
  }
  const diff = unifiedDiff({
    path: env.shown(path),
    from: from === undefined ? undefined : env.shown(from),
    before,
    after,
  })
  return Buffer.byteLength(diff.patch) > MAX_PATCH_BYTES ? NO_PATCH : diff
}

/** What happened to a file, from its text before and after the change. */
function kindOf(change: { before: DiffText; after: DiffText; from?: string }) {
  if (change.from !== undefined) return 'moved'
  if (change.after === undefined) return 'deleted'
  return change.before === undefined ? 'created' : 'updated'
}

/**
 * Send {@link FileChanged} for the file at `path`, a path from `env.reach`,
 * as it is now. Call it after the `afterWrite` hooks, so the change of a
 * formatter is in the patch. `before` is the text before the write, as
 * {@link readForDiff} gives it. `from` is the old path of a file that moved.
 * It sends nothing without `env.emit`, or when the text did not change.
 *
 * The tool wrote the file already, so a failed read or diff does not fail
 * the call: the event then has no patch.
 *
 * ponytail: the read takes no lock, so a write of another call right after
 * the hooks is in this patch too.
 *
 * @example
 * ```ts
 * await reportChange(env, { path: full, before, toolCallId: context?.toolCallId })
 * ```
 */
export async function reportChange(
  env: ToolEnv,
  change: {
    path: string
    before: DiffText
    from?: string
    toolCallId?: string
  },
) {
  const { emit } = env
  if (!emit) return
  const { path, before, from, toolCallId } = change
  const after = await readForDiff(env.backend, path)
  // The same text, or no file before and after.
  const isSame = before !== null && before === after
  if (isSame && from === undefined) return
  const diff = await patchOf(env, { path, from, before, after }).catch(
    () => NO_PATCH,
  )
  emit(FileChanged, {
    path,
    change: kindOf({ before, after, from }),
    ...(from === undefined ? {} : { from }),
    ...diff,
    ...(toolCallId === undefined ? {} : { toolCallId }),
  })
}
