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

/** The `formatter()` plugin changed a file after a tool wrote it. */
export const FormatterRewrote = createPluginEvent<{
  /** The absolute path of the file. */
  path: string
  /** The name of the formatter, like `prettier`. */
  formatter: string
}>('tanstack/formatter:rewrote')
