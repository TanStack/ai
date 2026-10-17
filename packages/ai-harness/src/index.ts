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
  HarnessToolInput,
  HarnessToolsOf,
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
  StepRun,
  ToolStep,
} from './durable-tool'

export { LogVersionError, logIdOf, logMessageStore } from './log'
export { LogOwnedElsewhereError } from './ownership'
export type {
  LogRecordRetention,
  ProjectOptions,
  ProjectRecord,
  ReduceOptions,
  SnapshotTiming,
} from './log'
export type { OwnershipOptions } from './ownership'

export { definePlugin } from './plugins'
export type {
  HarnessPlugin,
  HostPluginContext,
  HostPluginContributions,
  HostPluginDefinition,
  PluginContributions,
  PluginDefinition,
  PluginResources,
  PluginLifetime,
  PluginPrompt,
  AgentGroup,
  PluginAgentActions,
  PluginCommands,
  PluginSetupContext,
  PluginState,
  SessionPluginDefinition,
} from './plugins'

export { createExtensionPoint, createPluginEvent } from './extensions'
// Portable (no Node imports), so plugins such as code mode can read the
// permission rules and resources from the root.
export {
  PermissionDecisionCapability,
  PermissionResources,
  PermissionRules,
  decidePermission,
} from './first-party/permissions'
export type {
  CallResources,
  PermissionDecision,
  PermissionMode,
  PermissionRule,
  ToolResources,
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
  AgentStarter,
  AnyAgent,
  HarnessAgentContext,
} from './agents'

export { createHarnessHost } from './host'
export { createHarnessWorker } from './harness-worker'
export type { HarnessWorkerPoolOptions } from './harness-worker'
export type {
  ForkSessionOptions,
  HarnessHost,
  HarnessHostOptions,
  HarnessPersistence,
  HostEvent,
  HostLifecycleOptions,
  HostRevokedEvent,
  HostSessionDeletedEvent,
  HostSessionEvent,
  HostSessions,
  HostStatusEvent,
  OpenSessionOptions,
  ResumedThread,
  ResumePendingOptions,
  RetentionLimits,
  SubmitInput,
  SubmitOptions,
} from './host'
export { AccessDeniedError, membersOnly, membersOnlyPolicyOf } from './access'
export type {
  AccessAction,
  AccessRun,
  AccessSession,
  Authorize,
  AuthorizeInput,
  HarnessAccess,
  MembersOnlyOptions,
  MembersOnlyPolicy,
} from './access'
export type {
  SessionIndexEntry,
  SessionIndexListOptions,
  SessionIndexPage,
  SessionIndexStore,
  SessionMember,
} from '@tanstack/ai-persistence'

export type {
  HarnessSession,
  AgentHandle,
  AgentHandles,
  AgentRunInfo,
  AgentRunOptions,
  AgentStartOptions,
  DynamicAgentHandle,
  ScheduleOptions,
  SessionDescription,
  SessionInspection,
  SessionSnapshot,
} from './session/index'
export type { ObservedSession } from './session/observed-session'
export type { SessionUsage, UsageCounts } from './usage'
export type { OnHarnessEvent } from './feed'

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
  AgentSendOptions,
  AuthRequest,
  BusyPolicy,
  ChatTurnResult,
  Cursor,
  EventGap,
  ForkPoint,
  HarnessInput,
  HarnessRunContext,
  InputSettlement,
  LiveEvent,
  MediaKind,
  MediaRecord,
  OnEvent,
  Operation,
  OperationKind,
  OperationStatus,
  PendingQuestion,
  Principal,
  Receipt,
  RunContext,
  SendOptions,
  SessionEvent,
  StreamChunkOf,
  StreamChunkType,
  ThreadSettings,
  ThreadSettingsChange,
  TurnInfo,
  TurnOverrides,
  UsageUpdate,
  UserInput,
  WaitingInput,
} from './types'

export { harnessText } from './harness-text'
export type { HarnessTextOptions, RemoteHarness } from './harness-text'

export { oauthConnector } from './connectors'
export type { OAuthConnectorOptions } from './connectors'

export { harnessAgent } from './harness-agent'
export { DEFAULT_SUBAGENT_LIMITS } from './session/index'
