import type OpenAI from 'openai'
import type { ProviderTool, Tool } from '@tanstack/ai'

export type ShellToolConfig = OpenAI.Responses.FunctionShellTool

/** @deprecated Renamed to `ShellToolConfig`. Will be removed in a future release. */
export type ShellTool = ShellToolConfig

export type OpenAIShellTool = ProviderTool<'openai', 'shell'>

/**
 * Converts a standard Tool to OpenAI ShellTool format
 */
export function convertShellToolToAdapterFormat(_tool: Tool): ShellToolConfig {
  return {
    type: 'shell',
  }
}

/**
 * Creates a standard Tool from ShellTool parameters
 */
export function shellTool(): OpenAIShellTool {
  // Phantom-brand cast: '~provider'/'~toolKind' are type-only and never assigned at runtime.
  return {
    name: 'shell',
    description: 'Execute shell commands',
    metadata: {},
  } as unknown as OpenAIShellTool
}
