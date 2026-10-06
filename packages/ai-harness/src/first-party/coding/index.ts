// First-party plugins for a coding agent. This entry is Node only: the
// plugins use the file system and the shell.
export { workspaceTools } from './workspace'
export type { WorkspaceToolsOptions } from './workspace'
export { hostBackend } from './backend'
export type { WorkspaceBackend } from './backend'
export { WorkspaceHooks } from '../workspace-hooks'
