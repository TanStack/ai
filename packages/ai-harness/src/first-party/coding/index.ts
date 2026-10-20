// First-party plugins for a coding agent. This entry is Node only: the
// plugins use the file system and the shell.
export { workspaceTools } from './workspace'
export type { WorkspaceBinder, WorkspaceToolsOptions } from './workspace'
export { hostBackend, workspaceRoot } from './backend'
export type {
  BoundWorkspace,
  WorkspaceBackend,
  WorkspaceBinding,
} from './backend'
export { WorkspaceHooks } from '../workspace-hooks'
export type { SearchProvider, WebToolsOptions } from './web'
export { purgeSnapshots, snapshots } from './snapshots'
export type {
  SnapshotStep,
  SnapshotThread,
  SnapshotsOptions,
} from './snapshots'
export { FormatFailed, formatter } from './formatter'
export {
  FormatterRewrote,
  JobEnded,
  JobOutput,
  JobStarted,
  SnapshotFailed,
  WorkspaceStranded,
} from './events'
export type { Formatter, FormatterOptions, FormatterProject } from './formatter'
