// Code Mode Tool API
export { createCodeModeTool } from './create-code-mode-tool'
export type {
  ExecuteTypescriptInput,
  ExecuteTypescriptOutput,
} from './create-code-mode-tool'

export { createCodeModeSystemPrompt } from './create-system-prompt'
export { createCodeMode } from './create-code-mode'

export {
  InMemoryAgentStore,
  generateAgentName,
  type AgentSession,
  type AgentStore,
} from './agent-store'

// Bindings utilities (useful for custom implementations)
export {
  toolToBinding,
  toolsToBindings,
  createEventAwareBindings,
} from './bindings/tool-to-binding'

// Type generator (useful for custom system prompts)
export {
  generateTypeStubs,
  jsonSchemaToTypeScript,
  type TypeGeneratorOptions,
} from './type-generator/json-schema-to-ts'

// TypeScript stripping utility
export { stripTypeScript } from './strip-typescript'

// Code wrapper utility (used by isolate drivers)
export { wrapCode } from './code-wrapper'

// All types
export type {
  // Tool-based API types
  CodeModeToolConfig,
  CodeModeToolResult,
  // Isolate driver interfaces (used by driver packages)
  IsolateDriver,
  IsolateConfig,
  IsolateContext,
  ExecutionResult,
  NormalizedError,
  // Tool binding (used by driver packages)
  ToolBinding,
  // Tool input types
  CodeModeTool,
  // Re-exported from @tanstack/ai
  ToolExecutionContext,
} from './types'
