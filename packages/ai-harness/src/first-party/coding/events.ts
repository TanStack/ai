import { createPluginEvent } from '../../extensions'
import type { WorkspaceBinding } from '../../log-records'

/** A background `bash` job started. */
export const JobStarted = createPluginEvent<{
  /** The id that the model gets, like `bash-1`. */
  jobId: string
  command: string
}>('tanstack/workspace-tools:job-started')

/**
 * New output of a background `bash` job: stdout and stderr, in the order
 * they came. At most one event every 250 ms for each job, with the output
 * since the event before it. When a job writes more than 64 KiB in that
 * time, the event has the newest 64 KiB, and starts with a line that tells
 * how many bytes were dropped.
 */
export const JobOutput = createPluginEvent<{ jobId: string; output: string }>(
  'tanstack/workspace-tools:job-output',
)

/** A background `bash` job ended. It comes after its last output event. */
export const JobEnded = createPluginEvent<{ jobId: string; exitCode: number }>(
  'tanstack/workspace-tools:job-ended',
)

/**
 * The session log binds the workspace of a thread to a place that is gone,
 * like a sandbox that `reattach` of `workspace` cannot resume. Each tool
 * call of the thread fails with `message`. It comes each time the tools try
 * the workspace again: before a turn, and at a tool call.
 */
export const WorkspaceStranded = createPluginEvent<{
  threadId: string
  /** The last binding of the thread in the log. */
  binding: WorkspaceBinding
  message: string
}>('tanstack/workspace-tools:stranded')

/**
 * The `snapshots()` plugin could not take or save a snapshot. The turn goes
 * on. When git is missing, or the shadow repository cannot be made, the
 * event comes once for each session, and snapshots are off in it.
 */
export const SnapshotFailed = createPluginEvent<{ message: string }>(
  'tanstack/snapshots:failed',
)

/**
 * One changed file: from `write_file`, `edit_file`, or `patch`, or from
 * `snapshots()` for a file that another tool, like `bash`, changed, or that
 * `/undo`, `/redo`, a revert, or `unrevert()` put back.
 */
export interface FileChange {
  /** The absolute path of the file, as the tools use it. */
  path: string
  change: 'created' | 'updated' | 'deleted' | 'moved'
  /** The absolute old path of a file that moved. */
  from?: string
  /**
   * The change as a unified diff with 3 lines of context. Its paths are
   * from the workspace root, with `/`. Not set for a binary file, a patch
   * over 256 KiB, or a `.env` file. The workspace tools also send no patch
   * for a file over 1 MiB, or for a file that the permission rules protect.
   * `snapshots()` does not check these two: it only never stores `.env`
   * files.
   */
  patch?: string
  /** The added lines of `patch`. 0 without a patch. */
  additions: number
  /** The deleted lines of `patch`. 0 without a patch. */
  deletions: number
  /**
   * The tool call that changed the file. Not set for a call from code mode,
   * or for a file that `snapshots()` reports.
   */
  toolCallId?: string
}

/**
 * A file changed. `write_file`, `edit_file`, and `patch` send it after the
 * `afterWrite` hooks, so the change of a formatter is in the patch. A
 * `patch` call sends one event for each file, and one `'moved'` event for a
 * move. A write that leaves the text as it was sends none. `snapshots()`
 * sends it at the end of each model step for the files that the tools did
 * not report, like the files of `bash`. It also sends it for each file that
 * `/undo`, `/redo`, a revert, or `unrevert()` puts back. `snapshots()` sends
 * at most 100 for each step or restore, and never `'moved'`.
 */
export const FileChanged = createPluginEvent<FileChange>(
  'tanstack/workspace-tools:file-changed',
)

/** The `formatter()` plugin changed a file after a tool wrote it. */
export const FormatterRewrote = createPluginEvent<{
  /** The absolute path of the file. */
  path: string
  /** The name of the formatter, like `prettier`. */
  formatter: string
}>('tanstack/formatter:rewrote')
