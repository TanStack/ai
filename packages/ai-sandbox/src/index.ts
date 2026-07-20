// Capability tokens + accessors
export {
  SandboxCapability,
  SandboxStoreCapability,
  LocksCapability,
  SandboxPolicyCapability,
  ToolBridgeProvisionerCapability,
  getSandbox,
  provideSandbox,
  getSandboxStore,
  provideSandboxStore,
  getLocks,
  provideLocks,
  getSandboxPolicy,
  provideSandboxPolicy,
  getToolBridgeProvisioner,
  provideToolBridgeProvisioner,
} from './capabilities'

// Workspace projection capability (provided by withSandbox, consumed by harness adapters)
export {
  ProjectionCapability,
  getWorkspaceProjection,
  provideWorkspaceProjection,
} from './projection'
export type { WorkspaceProjection } from './projection'

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
export { defineSandboxPolicy, evaluateCommand, commandAliases } from './policy'
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
export { resolveHarnessCwd } from './harness-cwd'
export type { BootstrapResult } from './bootstrap'

// AGENTS.md writer + gitSkill path helper (used by bootstrap + harness adapters)
export {
  writeAgentsFile,
  resolveGitSkillDir,
  formatWorkspaceScriptsSection,
  mergeAgentsContent,
} from './agents-file'

// Exec-backed git helper (for providers without native git)
export { createExecBackedGit } from './git-exec'

// Harness runner: spawn an agent CLI in a sandbox + stream NDJSON stdout
export { spawnNdjson, toLines } from './runner'
export type { SpawnNdjsonOptions } from './runner'

// MCP tool-proxy bridge (shared by harness adapters): transport-agnostic core
// + the node:http host transport + a fetch-friendly JSON-RPC dispatcher.
export {
  startHostToolBridge,
  hostForSandbox,
  createToolBridgeCore,
  handleBridgeJsonRpc,
  timingSafeBearerEqual,
  nodeHttpBridgeProvisioner,
  BRIDGED_MCP_SERVER_NAME,
} from './tool-bridge'
export type {
  HostToolBridge,
  StartBridgeOptions,
  ToolBridgeCore,
  ToolBridgeCoreOptions,
  ToolDescriptor,
  ToolCallResult,
  BridgePermission,
  PermissionToolResult,
  ToolBridgeProvisioner,
  ToolBridgeProvisionOptions,
  ProvisionedBridge,
} from './tool-bridge'

// Surface bridged-tool custom events (e.g. code mode console logs) on a harness
// adapter's live output stream.
export { createBridgeEventChannel, mergeChunkStreams } from './bridge-events'
export type { BridgeEventChannel } from './bridge-events'

// Host-tool delegation for the co-located ("combined") model: harness + bridge
// run in-container; only chat()-tool EXECUTION crosses back to the orchestrator.
export {
  remoteToolStubs,
  toolDescriptors,
  httpRemoteToolExecutor,
  executeHostTool,
  isToolExecRequest,
} from './remote-tools'
export type {
  RemoteToolExecutor,
  RemoteToolExecuteOptions,
  ToolExecRequest,
} from './remote-tools'

// Resumable run event-log — the primitive that lets a trigger start a run and
// return while a durable orchestrator drives it and clients tail from a cursor.
export { InMemoryRunEventLog, isTerminalRunStatus } from './run-log'
export type {
  RunEventLog,
  RunRecord,
  RunEvent,
  RunStatus,
  TerminalRunStatus,
  RunError,
  RunEventLogReadOptions,
} from './run-log'

// Run driver — pump a chat() stream into the event-log so a trigger returns
// immediately while a durable orchestrator drives the run and clients tail it.
export { pipeToRunLog, RunController } from './run'
export type {
  PipeToRunLogOptions,
  RunControllerStartInput,
  RunHandle,
} from './run'

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
