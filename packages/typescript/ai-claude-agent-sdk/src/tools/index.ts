import type { CustomTool } from './custom-tool'

export { convertToolsToProviderFormat } from './tool-converter'
export { convertCustomToolToAdapterFormat } from './custom-tool'

/**
 * Union type for all supported tool types in the Claude Agent SDK adapter.
 * Currently only supports custom tools (TanStack AI tool definitions).
 * Built-in Claude Agent SDK tools (Bash, Read, Write, etc.) are disabled.
 */
export type ClaudeAgentSdkTool = CustomTool

// Export individual tool types
export type { CustomTool }
