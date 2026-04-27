import type OpenAI from 'openai'
import type { ProviderTool, Tool } from '@tanstack/ai'

export type LocalShellToolConfig = OpenAI.Responses.Tool.LocalShell

/** @deprecated Renamed to `LocalShellToolConfig`. Will be removed in a future release. */
export type LocalShellTool = LocalShellToolConfig

export type OpenAILocalShellTool = ProviderTool<'openai', 'local_shell'>

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
 * Creates a standard Tool from LocalShellTool parameters
 */
export function localShellTool(): OpenAILocalShellTool {
  // Phantom-brand cast: '~provider'/'~toolKind' are type-only and never assigned at runtime.
  return {
    name: 'local_shell',
    description: 'Execute local shell commands',
    metadata: {},
  } as unknown as OpenAILocalShellTool
}
