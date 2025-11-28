
import type OpenAI from 'openai'
import type { Tool } from '@tanstack/ai'

export type ShellTool = OpenAI.Responses.FunctionShellTool

/**
 * Converts a standard Tool to OpenAI ShellTool format
 */
export function convertShellToolToAdapterFormat(_tool: Tool): ShellTool {
  return {
    type: 'shell',
  }
}

/**
 * Creates a standard Tool from ShellTool parameters
 */
export function shellTool(): Tool {
  return {
    name: 'shell',
    description: 'Execute shell commands',
    metadata: {},
  }
}
