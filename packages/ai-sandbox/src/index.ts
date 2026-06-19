// Capability tokens + accessors
export {
  SandboxCapability,
  SandboxStoreCapability,
  LocksCapability,
  SandboxPolicyCapability,
  getSandbox,
  provideSandbox,
  getSandboxStore,
  provideSandboxStore,
  getLocks,
  provideLocks,
  getSandboxPolicy,
  provideSandboxPolicy,
} from './capabilities'

// Middleware
export { withSandbox } from './middleware'

// Sandbox definition + lifecycle
export { defineSandbox } from './sandbox'
export type {
  SandboxConfig,
  SandboxDefinition,
  SandboxEnsureContext,
  SandboxLifecycle,
  SandboxHooks,
  ReuseStrategy,
  SnapshotStrategy,
} from './sandbox'

// Workspace
export {
  defineWorkspace,
  gitSource,
  githubRepo,
  localSource,
  fileSkill,
  agentSkill,
  mcpSkill,
  gitSkill,
} from './workspace'
export type {
  WorkspaceDefinition,
  WorkspaceSource,
  WorkspaceSkill,
  PackageManager,
  McpConfig,
} from './workspace'

// Secrets
export {
  createSecrets,
  bearer,
  isSecretRef,
  resolveSecret,
  resolveBearer,
  resolveAllSecrets,
} from './secrets'
export type { SecretRef, Secrets, BearerRef } from './secrets'

// Policy
export { defineSandboxPolicy, evaluateCommand } from './policy'
export type {
  SandboxPolicy,
  PolicyDecision,
  CommandRules,
  CapabilityRules,
} from './policy'

// Provider + handle contracts
export type {
  SandboxProvider,
  SandboxHandle,
  SandboxCapabilities,
  SandboxFs,
  SandboxGit,
  SandboxProcess,
  SandboxPorts,
  SandboxEnv,
  SandboxChannel,
  SpawnHandle,
  ExecResult,
  ProcessOptions,
  SnapshotRef,
  SandboxCreateInput,
  SandboxResumeInput,
  SandboxRestoreInput,
  SandboxDestroyInput,
} from './contracts'

// Stores (interfaces + in-memory defaults)
export { InMemorySandboxStore, InMemoryLockStore } from './store'
export type { SandboxStore, LockStore, SandboxRecord } from './store'

// Bootstrap engine (exported for provider/adapter authors + tests)
export {
  bootstrapWorkspace,
  detectPackageManager,
  DEFAULT_WORKSPACE_ROOT,
} from './bootstrap'
export type { BootstrapResult } from './bootstrap'

// Exec-backed git helper (for providers without native git)
export { createExecBackedGit } from './git-exec'

// Harness runner: spawn an agent CLI in a sandbox + stream NDJSON stdout
export { spawnNdjson, toLines } from './runner'
export type { SpawnNdjsonOptions } from './runner'

// Host-side MCP tool-proxy bridge (shared by harness adapters)
export {
  startHostToolBridge,
  hostForSandbox,
  BRIDGED_MCP_SERVER_NAME,
} from './tool-bridge'
export type {
  HostToolBridge,
  StartBridgeOptions,
  PermissionToolResult,
} from './tool-bridge'

// Interactive approvals (shared by harness adapters)
export {
  resolveApproval,
  approvalId,
  buildApprovalRequestedEvent,
  APPROVAL_REQUESTED_EVENT,
} from './approvals'
export type { ResolveApprovalInput, ApprovalOutcome } from './approvals'

// File-event watch (low-level workspace observer)
export { watchWorkspace, diffSnapshots } from './watch'
export type {
  SandboxFileEvent,
  FileEvent,
  FileEventType,
  WatchOptions,
  SandboxWatchHandle,
} from './watch'

// Keying
export { computeSandboxKey, computeWorkspaceHash } from './key'
export type { SandboxKeyInput } from './key'

// Errors
export { UnsupportedCapabilityError, MissingSandboxError } from './errors'
