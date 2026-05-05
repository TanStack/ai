import type { ProviderTool, Tool } from '@tanstack/ai'

export interface XSearchToolConfig {
  type: 'x_search'
  allowed_x_handles?: Array<string>
  excluded_x_handles?: Array<string>
  from_date?: string
  to_date?: string
  enable_image_understanding?: boolean
  enable_video_understanding?: boolean
}

export type XSearchToolOptions = Omit<XSearchToolConfig, 'type'>

/** @deprecated Renamed to `XSearchToolConfig`. Will be removed in a future release. */
export type XSearchTool = XSearchToolConfig

export type GrokXSearchTool = ProviderTool<'grok', 'x_search'>

export function convertXSearchToolToAdapterFormat(
  tool: Tool,
): XSearchToolConfig {
  const metadata = tool.metadata as XSearchToolConfig
  return metadata
}

export function xSearchTool(
  toolData: XSearchToolOptions = {},
): GrokXSearchTool {
  return {
    name: 'x_search',
    description: 'Search X posts, profiles, and threads',
    metadata: { type: 'x_search', ...toolData },
  } as unknown as GrokXSearchTool
}
