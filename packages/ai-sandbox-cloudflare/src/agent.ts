// The headline factory + its config/result types.
export { createCloudflareSandboxAgent } from './factory'
export type {
  CloudflareSandboxAgent,
  CloudflareSandboxAgentConfig,
  DoDrivesAgentConfig,
  ColocatedAgentConfig,
  SandboxAgentEnv,
} from './factory'

export {
  SandboxCoordinator,
  resolveBridgeOrigin,
  resolvePreviewHost,
} from './coordinator'
export type { StartRunInput } from './coordinator'

export { exposePreviewTool, PREVIEW_GUIDANCE } from './preview-tool'
export type { PreviewToolEnv } from './preview-tool'

// The two concrete coordinators + their per-run config + Env types.
export { ChatSandboxCoordinator } from './chat-coordinator'
export type { ChatCoordinatorEnv, ChatRunConfig } from './chat-coordinator'
export { ContainerSandboxCoordinator } from './container-coordinator'
export type {
  ContainerCoordinatorEnv,
  ContainerRunConfig,
} from './container-coordinator'

// The shared `POST /run` wire contract (built by the coordinator, validated by
// the `/runner` entry). Defined runtime-agnostically in `./protocol`.
export { parseContainerRunRequest } from './protocol'
export type { ContainerRunRequest, HarnessId } from './protocol'

// The Worker fetch-handler factory + its resolver type.
export { createSandboxAgentWorker } from './worker'
export type { ResolveCoordinator } from './worker'

// The durable run-log + the Web Crypto bearer helper (for direct composition).
export { DurableObjectRunEventLog } from './run-log-do'
export { timingSafeBearerEqualWeb } from './web-crypto'

export { InMemoryRunEventLog, migrateStoredRunRecord } from './run-log'
export type {
  RunEventLog,
  RunEvent,
  RunEventLogReadOptions,
  RunLogRecord,
  RunRecordPatch,
} from './run-log'

export { runLogStore, runLogStream } from './durability'
export type { RunLogStreamInit } from './durability'
