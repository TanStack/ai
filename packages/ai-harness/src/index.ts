export { defineHarness, isHarnessDefinition } from './define'
export type {
  AnyHarness,
  HarnessAgentsOf,
  HarnessConfig,
  HarnessDefinition,
  HarnessSubagents,
} from './define'

export { definePlugin } from './plugins'
export type {
  HarnessPlugin,
  PluginContributions,
  PluginDefinition,
  PluginLifetime,
  PluginPrompt,
  PluginSetupContext,
  PluginState,
} from './plugins'

export { createExtensionPoint, createPluginEvent } from './extensions'
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
  SessionInspection,
  SessionSnapshot,
} from './session'

export { HARNESS_EVENTS } from './types'
export type {
  BusyPolicy,
  ChatTurnResult,
  Cursor,
  HarnessInput,
  Operation,
  OperationKind,
  OperationStatus,
  Principal,
  Receipt,
  SessionEvent,
  UserInput,
} from './types'

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
export type { HarnessTextOptions } from './harness-text'

export {
  buildAuthorizationUrl,
  createPkce,
  deviceLogin,
  exchangeCode,
  isExpired,
  loopbackLogin,
  refreshCredential,
} from './oauth'
export type { OAuthConfig } from './oauth'

export { oauthConnector } from './connectors'
export type { OAuthConnectorOptions } from './connectors'
