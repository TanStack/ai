export { defineHarness, isHarnessDefinition } from './define'
export type {
  AnyHarness,
  HarnessAgentsOf,
  HarnessConfig,
  HarnessDefinition,
  HarnessDurability,
  HarnessRouterContext,
  HarnessRouting,
  HarnessSubagents,
} from './define'

export { durableTool } from './durable-tool'
export type {
  DurableToolContext,
  DurableToolOptions,
  ToolStep,
} from './durable-tool'

export { logMessageStore } from './log'
export type { ProjectOptions, ProjectRecord, ReduceOptions } from './log'
export type { LeaseOptions } from './resume'
export type {
  LeaseStore,
  TurnLease,
  TurnLeaseKey,
} from '@tanstack/ai-persistence'

export { definePlugin } from './plugins'
export type {
  HarnessPlugin,
  PluginContributions,
  PluginDefinition,
  PluginLifetime,
  PluginPrompt,
  AgentGroup,
  PluginAgentActions,
  PluginCommands,
  PluginSetupContext,
  PluginState,
} from './plugins'

export { createExtensionPoint, createPluginEvent } from './extensions'
// Portable (no Node imports), so edge-safe plugins such as code mode can read
// the permission rules without the Node-only `./plugins` entry.
export { PermissionRules, decidePermission } from './first-party/permissions'
export type {
  PermissionDecision,
  PermissionMode,
  PermissionRule,
} from './first-party/permissions'
export type { ExtensionItem, ExtensionPoint, PluginEvent } from './extensions'

export { checkConfigValue, configOption } from './config'
export type { ConfigOption } from './config'

export { defineCommand } from './commands'
export type {
  AnswerOf,
  AnyCommand,
  CommandContext,
  CommandDefinition,
  PluginSessionApi,
  Question,
} from './commands'

export { AuthRequiredError, scrubSecrets } from './auth'
export type { CredentialsAccess } from './auth'

export type {
  AgentInputOf,
  AgentRegistryView,
  AgentResultOf,
  AnyAgent,
} from './agents'

export { createHarnessHost } from './host'
export type {
  HarnessHost,
  HarnessHostOptions,
  HarnessPersistence,
  OpenSessionOptions,
} from './host'

export { HarnessSession } from './session'
export type {
  AgentHandle,
  AgentHandles,
  AgentRunOptions,
  AgentStartOptions,
  DynamicAgentHandle,
  SessionDescription,
  SessionInspection,
  SessionSnapshot,
} from './session'

export type {
  FinishContext,
  HarnessTurnOptions,
  JoinCandidate,
  JoinContext,
  ModelErrorContext,
  RecoverContext,
  RecoverDecision,
  RecoverHook,
  TurnAdditions,
} from './turn'
export { isTransientModelError, retryTransientErrors } from './turn'

export { HARNESS_EVENTS, InputRejectedError } from './types'
export type {
  BusyPolicy,
  ChatTurnResult,
  Cursor,
  HarnessInput,
  InputSettlement,
  MediaKind,
  MediaRecord,
  Operation,
  OperationKind,
  OperationStatus,
  Principal,
  Receipt,
  SessionEvent,
  TurnInfo,
  TurnOverrides,
  UserInput,
} from './types'

export {
  MEDIA_URL_PREFIX,
  isMediaRecord,
  kindOf,
  mediaIdOf,
  mediaOfMessage,
  mediaPart,
  mimeTypeOf,
} from './media-ref'

export { MediaError } from './media'
export type { MediaOptions } from './media'

export {
  HARNESS_PROTOCOL_VERSION,
  applyInput,
  capabilitiesOf,
  parseControlFrame,
  parseHarnessInput,
} from './protocol'
export type { ControlFrame, HostFrame } from './protocol'

export { createHarnessHandler, handleHarnessSocket } from './http'
export type {
  Authorize,
  HarnessHandlerOptions,
  HarnessSocketOptions,
} from './http'

export { harnessText } from './harness-text'
export type { HarnessTextOptions, RemoteHarness } from './harness-text'

export {
  buildAuthorizationUrl,
  createPkce,
  deviceLogin,
  exchangeCode,
  isExpired,
  loopbackLogin,
  refreshCredential,
  startLoopbackReceiver,
} from './oauth'
export type { OAuthConfig } from './oauth'

export { oauthConnector } from './connectors'
export type { OAuthConnectorOptions } from './connectors'

export { harnessAgent } from './harness-agent'
export { DEFAULT_SUBAGENT_LIMITS } from './session'
