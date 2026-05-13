import type OpenAI from 'openai'
import type { Tool } from '@tanstack/ai'

export type ShellToolConfig = OpenAI.Responses.FunctionShellTool

/** @deprecated Renamed to `ShellToolConfig`. Will be removed in a future release. */
export type ShellTool = ShellToolConfig

/**
 * Converts a standard Tool to OpenAI ShellTool format
 */
export function convertShellToolToAdapterFormat(_tool: Tool): ShellToolConfig {
  return {
    type: 'shell',
  }
}

/**
 * Creates a standard Tool from ShellTool parameters.
 *
 * Base (non-branded) factory. Providers that need branded return types should
 * re-wrap this in their own package.
 */
export function shellTool(): Tool {
  return {
    name: 'shell',
    description: 'Execute shell commands',
    metadata: {},
  }
}
