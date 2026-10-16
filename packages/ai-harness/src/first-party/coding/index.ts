// First-party plugins for a coding agent. This entry is Node only: the
// plugins use the file system and the shell.
export { workspaceTools } from './workspace'
export type { WorkspaceToolsOptions } from './workspace'
export { hostBackend } from './backend'
export type { WorkspaceBackend } from './backend'
export { WorkspaceHooks } from '../workspace-hooks'
export type { SearchProvider, WebToolsOptions } from './web'
export { snapshots } from './snapshots'
export type { SnapshotStep, SnapshotsOptions } from './snapshots'
export { FormatFailed, formatter } from './formatter'
export type { Formatter, FormatterOptions, FormatterProject } from './formatter'
