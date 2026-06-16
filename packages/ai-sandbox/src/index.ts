// Capability tokens + accessors
export {
  SandboxCapability,
  SandboxStoreCapability,
  LocksCapability,
  getSandbox,
  provideSandbox,
  getSandboxStore,
  provideSandboxStore,
  getLocks,
  provideLocks,
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
} from './workspace'
export type {
  WorkspaceDefinition,
  WorkspaceSource,
  WorkspaceSkill,
  PackageManager,
} from './workspace'

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

// Keying
export { computeSandboxKey, computeWorkspaceHash } from './key'
export type { SandboxKeyInput } from './key'

// Errors
export { UnsupportedCapabilityError, MissingSandboxError } from './errors'
