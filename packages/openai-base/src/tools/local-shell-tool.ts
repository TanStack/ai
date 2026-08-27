import { openAIProviderTool } from './openai-provider-tool'
import type { Tool as SDKTool } from 'openai/resources/responses/responses'
import type { Tool } from '@tanstack/ai'

type LocalShellToolConfig = SDKTool.LocalShell

export type { LocalShellToolConfig }

/** @deprecated Renamed to `LocalShellToolConfig`. Will be removed in a future release. */
export type LocalShellTool = LocalShellToolConfig

export function convertLocalShellToolToAdapterFormat(
  _tool: Tool,
): LocalShellToolConfig {
  return {
    type: 'local_shell',
  }
}

export function localShellTool(): Tool {
  return openAIProviderTool(
    {
      name: 'local_shell',
      description: 'Execute local shell commands',
      metadata: {},
    },
    'local_shell',
  )
}
