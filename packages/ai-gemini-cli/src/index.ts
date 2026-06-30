export { GeminiCliTextAdapter, geminiCliText } from './adapters/text'
export type { GeminiCliTextConfig } from './adapters/text'
export type { GeminiCliTextProviderOptions } from './provider-options'
export { GEMINI_CLI_MODELS } from './model-meta'
export type { GeminiCliModel, KnownGeminiCliModel } from './model-meta'
export { SESSION_ID_EVENT, PLAN_EVENT } from './labels'
export {
  BRIDGED_MCP_SERVER_NAME,
  matchBridgedToolName,
  translateAcpStream,
  resolvePermission,
  startAcpSession,
  spawnHandleToAcpTransport,
} from '@tanstack/ai-acp'
export type {
  AcpStreamEvent,
  TranslateContext,
  AcpPermissionOption,
  AcpPermissionOutcome,
  AcpPermissionRequest,
  AcpSessionUpdate,
  AcpStopReason,
  AcpToolCallUpdate,
  AcpUsage,
  AcpPermissionMode as GeminiCliPermissionMode,
  PermissionHandler,
  AcpSessionHandle,
  StartAcpSessionOptions,
  AcpTransport,
} from '@tanstack/ai-acp'
export { buildPrompt } from './messages/prompt'
export type { BuiltPrompt } from './messages/prompt'