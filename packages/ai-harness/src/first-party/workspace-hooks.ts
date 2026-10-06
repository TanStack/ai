import { createExtensionPoint } from '../extensions'

/**
 * Hooks for the workspace tools. Each runs inside the tool, while the tool
 * holds the lock on that path. A hook that throws fails the tool call.
 */
export interface WorkspaceHooks {
  /** Runs after a tool wrote the file at `path`, an absolute path. */
  afterWrite?: (path: string) => Promise<void>
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
