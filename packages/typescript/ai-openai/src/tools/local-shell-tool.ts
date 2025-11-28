import type OpenAI from 'openai'
import type { Tool } from '@tanstack/ai'

export type LocalShellTool = OpenAI.Responses.Tool.LocalShell

/**
 * Converts a standard Tool to OpenAI LocalShellTool format
 */
export function convertLocalShellToolToAdapterFormat(
  _tool: Tool,
): LocalShellTool {
  return {
    type: 'local_shell',
  }
}

/**
 * Creates a standard Tool from LocalShellTool parameters
 */
export function localShellTool(): Tool {
  return {
    name: 'local_shell',
    description: 'Execute local shell commands',
    metadata: {},
  }
}
