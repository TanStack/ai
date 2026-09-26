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
} from './plugins'

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
