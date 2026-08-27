import {
  getOpenAIProviderToolMetadata,
  openAIProviderTool,
} from './openai-provider-tool'
import type { Tool as SDKTool } from 'openai/resources/responses/responses'
import type { Tool } from '@tanstack/ai'

type CodeInterpreterToolConfig = SDKTool.CodeInterpreter

export type { CodeInterpreterToolConfig }

/** @deprecated Renamed to `CodeInterpreterToolConfig`. Will be removed in a future release. */
export type CodeInterpreterTool = CodeInterpreterToolConfig

export function convertCodeInterpreterToolToAdapterFormat(
  tool: Tool,
): CodeInterpreterToolConfig {
  const metadata = getOpenAIProviderToolMetadata(
    tool,
  ) as CodeInterpreterToolConfig
  return {
    type: 'code_interpreter',
    container: metadata.container,
  }
}

export function codeInterpreterTool(
  container: CodeInterpreterToolConfig,
): Tool {
  return openAIProviderTool(
    {
      name: 'code_interpreter',
      description: 'Execute code in a sandboxed environment',
      metadata: {
        type: 'code_interpreter',
        container,
      },
    },
    'code_interpreter',
  )
}
