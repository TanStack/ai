export { AntigravityCliTextAdapter, antigravityCliText } from './adapters/text'
export type { AntigravityCliTextConfig } from './adapters/text'
export type { AntigravityCliTextProviderOptions } from './provider-options'
export { ANTIGRAVITY_CLI_MODELS } from './model-meta'
export type {
  AntigravityCliModel,
  KnownAntigravityCliModel,
} from './model-meta'
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
  AcpPermissionMode as AntigravityCliPermissionMode,
  PermissionHandler,
  AcpSessionHandle,
  StartAcpSessionOptions,
  AcpTransport,
} from '@tanstack/ai-acp'
export { buildPrompt } from './messages/prompt'
export type { BuiltPrompt } from './messages/prompt'
