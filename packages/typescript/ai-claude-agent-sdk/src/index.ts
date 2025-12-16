/**
 * @tanstack/ai-claude-agent-sdk
 *
 * Claude Agent SDK adapter for TanStack AI.
 * Enables Claude Max subscribers to use their subscription for AI development
 * via Claude Code/Agent SDK instead of requiring separate API keys.
 *
 * @packageDocumentation
 */

// Main adapter exports
export {
  ClaudeAgentSdk,
  createClaudeAgentSdk,
  claudeAgentSdk,
  type ClaudeAgentSdkConfig,
} from './claude-agent-sdk-adapter'

// Model metadata exports
export {
  CLAUDE_AGENT_SDK_MODELS,
  type ClaudeAgentSdkModel,
  type ClaudeAgentSdkChatModelProviderOptionsByName,
  type ClaudeAgentSdkModelInputModalitiesByName,
} from './model-meta'

// Provider options exports
export type {
  ClaudeAgentSdkProviderOptions,
  ThinkingOptions,
} from './text/text-provider-options'

// Message metadata exports
export type {
  ClaudeAgentSdkTextMetadata,
  ClaudeAgentSdkImageMetadata,
  ClaudeAgentSdkDocumentMetadata,
  ClaudeAgentSdkAudioMetadata,
  ClaudeAgentSdkVideoMetadata,
  ClaudeAgentSdkImageMediaType,
  ClaudeAgentSdkDocumentMediaType,
  ClaudeAgentSdkMessageMetadataByModality,
} from './message-types'

// Tool exports
export { convertToolsToProviderFormat } from './tools/tool-converter'
export type { ClaudeAgentSdkTool, CustomTool } from './tools'

// Built-in Claude Code tools
export {
  builtinTools,
  isBuiltinTool,
  BUILTIN_TOOL_NAMES,
  type BuiltinToolDefinition,
  type BuiltinToolName,
  // Individual tool exports for convenience
  Read,
  Write,
  Edit,
  Bash,
  Glob,
  Grep,
  WebFetch,
  WebSearch,
  Task,
  TodoWrite,
  NotebookEdit,
  AskUserQuestion,
} from './builtin-tools'
