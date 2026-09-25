import type { Tool } from '@tanstack/ai'

const OPENAI_PROVIDER_TOOL_KINDS = {
  apply_patch: 'openai.apply_patch',
  code_interpreter: 'openai.code_interpreter',
  computer_use: 'openai.computer_use',
  custom: 'openai.custom',
  file_search: 'openai.file_search',
  image_generation: 'openai.image_generation',
  local_shell: 'openai.local_shell',
  mcp: 'openai.mcp',
  shell: 'openai.shell',
  web_search: 'openai.web_search',
  web_search_preview: 'openai.web_search_preview',
} as const

export type OpenAIProviderToolKind = keyof typeof OPENAI_PROVIDER_TOOL_KINDS

export function openAIProviderTool(
  tool: Tool,
  toolKind: OpenAIProviderToolKind,
): Tool {
  return {
    ...tool,
    metadata: {
      ...tool.metadata,
      __kind: OPENAI_PROVIDER_TOOL_KINDS[toolKind],
    },
  }
}

export function getOpenAIProviderToolKind(
  tool: Tool,
): OpenAIProviderToolKind | undefined {
  const toolKind = tool.metadata?.['__kind']
  switch (toolKind) {
    case 'openai.apply_patch':
      return 'apply_patch'
    case 'openai.code_interpreter':
      return 'code_interpreter'
    case 'openai.computer_use':
      return 'computer_use'
    case 'openai.custom':
      return 'custom'
    case 'openai.file_search':
      return 'file_search'
    case 'openai.image_generation':
      return 'image_generation'
    case 'openai.local_shell':
      return 'local_shell'
    case 'openai.mcp':
      return 'mcp'
    case 'openai.shell':
      return 'shell'
    case 'openai.web_search':
      return 'web_search'
    case 'openai.web_search_preview':
      return 'web_search_preview'
    default:
      return undefined
  }
}

/** Returns adapter metadata without the internal runtime discriminator. */
export function getOpenAIProviderToolMetadata(tool: Tool): Tool['metadata'] {
  if (!tool.metadata) {
    return undefined
  }
  const { __kind: _kind, ...metadata } = tool.metadata
  void _kind
  return metadata
}
