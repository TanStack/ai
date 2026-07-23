import { brandProviderTool } from '@tanstack/ai'
import type { ProviderTool, Tool } from '@tanstack/ai'

const GEMINI_PROVIDER_TOOL_KINDS = {
  code_execution: 'gemini.code_execution',
  computer_use: 'gemini.computer_use',
  file_search: 'gemini.file_search',
  google_maps: 'gemini.google_maps',
  google_search: 'gemini.google_search',
  google_search_retrieval: 'gemini.google_search_retrieval',
  url_context: 'gemini.url_context',
} as const

type GeminiProviderToolKind = keyof typeof GEMINI_PROVIDER_TOOL_KINDS

export function brandGeminiProviderTool<
  T extends ProviderTool<'gemini', GeminiProviderToolKind>,
>(tool: Omit<T, '~provider' | '~toolKind'>, toolKind: T['~toolKind']): T {
  return brandProviderTool<T>({
    ...tool,
    metadata: {
      ...tool.metadata,
      __kind: GEMINI_PROVIDER_TOOL_KINDS[toolKind],
    },
  })
}

export function getGeminiProviderToolKind(
  tool: Tool,
): GeminiProviderToolKind | undefined {
  const toolKind = tool.metadata?.['__kind']
  switch (toolKind) {
    case 'gemini.code_execution':
      return 'code_execution'
    case 'gemini.computer_use':
      return 'computer_use'
    case 'gemini.file_search':
      return 'file_search'
    case 'gemini.google_maps':
      return 'google_maps'
    case 'gemini.google_search':
      return 'google_search'
    case 'gemini.google_search_retrieval':
      return 'google_search_retrieval'
    case 'gemini.url_context':
      return 'url_context'
    default:
      return undefined
  }
}

/** Returns adapter metadata without the internal runtime discriminator. */
export function getGeminiProviderToolMetadata(tool: Tool): Tool['metadata'] {
  if (!tool.metadata) {
    return undefined
  }
  const { __kind: _kind, ...metadata } = tool.metadata
  void _kind
  return metadata
}
