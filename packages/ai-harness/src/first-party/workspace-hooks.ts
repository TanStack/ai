import { createExtensionPoint } from '../extensions'

/**
 * Hooks for the workspace tools. Each runs inside the tool, while the tool
 * holds the lock on that path. A hook that throws fails the tool call.
 */
export interface WorkspaceHooks {
  /**
   * Runs before `write_file`, `edit_file`, or `patch` changes the file at
   * `path`, an absolute path, and before the tool takes the lock. Return
   * `{ refuse }` to stop the call: the tool changes no file, and `refuse`
   * is its error. A `patch` asks for each file before its first write.
   */
  beforeWrite?: (path: string) => Promise<void | { refuse: string }>
  /**
   * Runs after a tool wrote the file at `path`, an absolute path. Return
   * text to add to the result, or nothing to add nothing.
   */
  afterWrite?: (path: string) => Promise<string | void>
  /**
   * Runs after `read_file` read the file at `path`, an absolute path. Return
   * text to add to the result, or `undefined` to add nothing.
   */
  afterRead?: (path: string) => Promise<string | undefined>
}

/**
 * Plugins add {@link WorkspaceHooks} here. The workspace tools run them.
 *
 * @example
 * ```ts
 * definePlugin({
 *   name: 'acme/format',
 *   setup: () => ({
 *     contribute: [WorkspaceHooks.item({ afterWrite: async (path) => format(path) })],
 *   }),
 * })
 * ```
 */
export const WorkspaceHooks = createExtensionPoint<WorkspaceHooks>(
  'tanstack/workspace-hooks',
)
