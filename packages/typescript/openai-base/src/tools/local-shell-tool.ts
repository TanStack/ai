import type OpenAI from 'openai'
import type { Tool } from '@tanstack/ai'

export type LocalShellToolConfig = OpenAI.Responses.Tool.LocalShell

/** @deprecated Renamed to `LocalShellToolConfig`. Will be removed in a future release. */
export type LocalShellTool = LocalShellToolConfig

/**
 * Converts a standard Tool to OpenAI LocalShellTool format
 */
export function convertLocalShellToolToAdapterFormat(
  _tool: Tool,
): LocalShellToolConfig {
  return {
    type: 'local_shell',
  }
}

/**
 * Creates a standard Tool from LocalShellTool parameters.
 *
 * Base (non-branded) factory. Providers that need branded return types should
 * re-wrap this in their own package.
 */
export function localShellTool(): Tool {
  return {
    name: 'local_shell',
    description: 'Execute local shell commands',
    metadata: {},
  }
}
