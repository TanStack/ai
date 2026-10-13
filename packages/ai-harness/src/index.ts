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
  SessionMetadataOf,
  SessionWithMetadata,
} from './define'
export { SessionMetadataError } from './session-entry'
export type {
  MetadataOf,
  SessionEntryChange,
  SessionEntryUpdate,
} from './session-entry'

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

export { harnessContext } from './agents'
export type {
  AgentInputOf,
  AgentRegistryView,
  AgentResultOf,
  AgentStarter,
  AnyAgent,
  HarnessAgentContext,
} from './agents'

export { createHarnessHost } from './host'
export type {
  ForkSessionOptions,
  HarnessHost,
  HarnessHostOptions,
  HarnessPersistence,
  HostEvent,
  HostSessionDeletedEvent,
  HostSessionEvent,
  HostSessions,
  HostStatusEvent,
  OpenSessionOptions,
  ResumePendingOptions,
} from './host'
export type {
  SessionIndexEntry,
  SessionIndexListOptions,
  SessionIndexPage,
  SessionIndexStore,
} from '@tanstack/ai-persistence'

export { HarnessSession } from './session/index'
export type {
  AgentHandle,
  AgentHandles,
  AgentRunInfo,
  AgentRunOptions,
  AgentStartOptions,
  DynamicAgentHandle,
  SessionDescription,
  SessionInspection,
  SessionSnapshot,
} from './session/index'
export type { SessionUsage, UsageCounts } from './usage'

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
  AgentRun,
  BusyPolicy,
  ChatTurnResult,
  Cursor,
  ForkPoint,
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
  ThreadSettings,
  ThreadSettingsChange,
  TurnInfo,
  TurnOverrides,
  UserInput,
  WaitingInput,
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

export { harnessText } from './harness-text'
export type { HarnessTextOptions, RemoteHarness } from './harness-text'

export { harnessAgent } from './harness-agent'
export { DEFAULT_SUBAGENT_LIMITS } from './session/index'
