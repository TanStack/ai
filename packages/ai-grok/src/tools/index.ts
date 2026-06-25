import { brandProviderTool } from '@tanstack/ai'
import { convertFunctionToolToResponsesFormat } from '@tanstack/openai-base'
import type { ProviderTool, Tool } from '@tanstack/ai'
import type { ResponsesFunctionTool } from '@tanstack/openai-base'
import type { GrokProviderToolKind } from '../model-meta'

export type FunctionTool = ResponsesFunctionTool

export { convertFunctionToolToResponsesFormat as convertFunctionToolToAdapterFormat }

export type GrokProviderTool<TKind extends GrokProviderToolKind> = ProviderTool<
  'grok',
  TKind
>

type GrokToolKindMarker<TKind extends GrokProviderToolKind> = `grok.${TKind}`

export interface GrokWebSearchToolConfig {
  type: 'web_search'
  filters?: {
    allowed_domains?: Array<string>
    excluded_domains?: Array<string>
  }
  enable_image_understanding?: boolean
  enable_image_search?: boolean
}

export interface GrokXSearchToolConfig {
  type: 'x_search'
  allowed_x_handles?: Array<string>
  excluded_x_handles?: Array<string>
  from_date?: string
  to_date?: string
  enable_image_understanding?: boolean
  enable_video_understanding?: boolean
}

export interface GrokFileSearchToolConfig {
  type: 'file_search'
  vector_store_ids: Array<string>
  max_num_results?: number
}

export interface GrokMCPToolConfig {
  type: 'mcp'
  server_label: string
  server_url: string
  allowed_tools?: Array<string>
  server_description?: string
  authorization?: string
  headers?: Record<string, string>
}

export type GrokServerTool =
  | GrokWebSearchToolConfig
  | GrokXSearchToolConfig
  | GrokFileSearchToolConfig
  | GrokMCPToolConfig

type GrokProviderToolMetadata<TKind extends GrokProviderToolKind> = Extract<
  GrokServerTool,
  { type: TKind }
> & {
  __kind: GrokToolKindMarker<TKind>
}

export type GrokResponsesTool = GrokServerTool | ResponsesFunctionTool

function providerTool<TKind extends GrokProviderToolKind>(
  kind: TKind,
  description: string,
  metadata: Extract<GrokServerTool, { type: TKind }>,
): GrokProviderTool<TKind> {
  return brandProviderTool<GrokProviderTool<TKind>>({
    name: kind,
    description,
    metadata: {
      __kind: `grok.${kind}`,
      ...metadata,
    },
  })
}

export function grokWebSearchTool(
  config: Omit<GrokWebSearchToolConfig, 'type'> = {},
): GrokProviderTool<'web_search'> {
  if (
    config.filters?.allowed_domains !== undefined &&
    config.filters.excluded_domains !== undefined
  ) {
    throw new Error(
      'allowed_domains and excluded_domains cannot both be provided.',
    )
  }
  if (
    config.filters?.allowed_domains !== undefined &&
    config.filters.allowed_domains.length > 5
  ) {
    throw new Error('allowed_domains supports at most 5 domains.')
  }
  if (
    config.filters?.excluded_domains !== undefined &&
    config.filters.excluded_domains.length > 5
  ) {
    throw new Error('excluded_domains supports at most 5 domains.')
  }
  return providerTool('web_search', 'Search the web', {
    type: 'web_search',
    ...config,
  })
}

export function grokXSearchTool(
  config: Omit<GrokXSearchToolConfig, 'type'> = {},
): GrokProviderTool<'x_search'> {
  if (
    config.allowed_x_handles !== undefined &&
    config.excluded_x_handles !== undefined
  ) {
    throw new Error(
      'allowed_x_handles and excluded_x_handles cannot both be provided.',
    )
  }
  if (
    config.allowed_x_handles !== undefined &&
    config.allowed_x_handles.length > 20
  ) {
    throw new Error('allowed_x_handles supports at most 20 handles.')
  }
  if (
    config.excluded_x_handles !== undefined &&
    config.excluded_x_handles.length > 20
  ) {
    throw new Error('excluded_x_handles supports at most 20 handles.')
  }
  return providerTool('x_search', 'Search X posts', {
    type: 'x_search',
    ...config,
  })
}

export function grokFileSearchTool(
  config: Omit<GrokFileSearchToolConfig, 'type'>,
): GrokProviderTool<'file_search'> {
  if (config.vector_store_ids.length === 0) {
    throw new Error('vector_store_ids must contain at least one collection id.')
  }
  if (config.max_num_results !== undefined) {
    if (config.max_num_results < 1 || config.max_num_results > 50) {
      throw new Error('max_num_results must be between 1 and 50.')
    }
  }
  return providerTool('file_search', 'Search xAI file collections', {
    type: 'file_search',
    ...config,
  })
}

export function grokMCPTool(
  config: Omit<GrokMCPToolConfig, 'type'>,
): GrokProviderTool<'mcp'> {
  if (!config.server_url) {
    throw new Error('server_url must be provided.')
  }
  return providerTool('mcp', config.server_description || 'Remote MCP server', {
    type: 'mcp',
    ...config,
  })
}

function getGrokProviderToolKind(tool: Tool): GrokProviderToolKind | undefined {
  const kind = (tool.metadata as { __kind?: unknown } | undefined)?.__kind
  switch (kind) {
    case 'grok.web_search':
      return 'web_search'
    case 'grok.x_search':
      return 'x_search'
    case 'grok.file_search':
      return 'file_search'
    case 'grok.mcp':
      return 'mcp'
    default:
      return undefined
  }
}

function convertGrokProviderToolToAdapterFormat(
  tool: Tool,
  kind: GrokProviderToolKind,
): GrokServerTool {
  const metadata = tool.metadata as GrokProviderToolMetadata<typeof kind>
  if (metadata.type !== kind) {
    throw new Error(
      `convertGrokProviderToolToAdapterFormat: tool "${tool.name}" has mismatched Grok tool metadata.`,
    )
  }
  const { __kind: _kind, ...toolConfig } = metadata
  void _kind
  return toolConfig
}

export function convertToolsToProviderFormat(
  tools: Array<Tool>,
): Array<GrokResponsesTool> {
  return tools.map((tool) => {
    const grokProviderToolKind = getGrokProviderToolKind(tool)
    if (grokProviderToolKind) {
      return convertGrokProviderToolToAdapterFormat(tool, grokProviderToolKind)
    }
    return convertFunctionToolToResponsesFormat(tool)
  })
}
