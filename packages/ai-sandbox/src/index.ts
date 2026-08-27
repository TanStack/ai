// Capability tokens + accessors (sandbox-owned only).
// LockStore / withLocks / defineLock: import from @tanstack/ai/locks.
export {
  SandboxCapability,
  SandboxPolicyCapability,
  ToolBridgeProvisionerCapability,
  getSandbox,
  provideSandbox,
  getSandboxPolicy,
  provideSandboxPolicy,
  getToolBridgeProvisioner,
  provideToolBridgeProvisioner,
} from './capabilities'

export {
  SandboxInstanceStoreCapability,
  getSandboxInstanceStore,
  provideSandboxInstanceStore,
  InMemorySandboxInstanceStore,
  defineSandboxInstanceStore,
} from './instance-store'
export type {
  SandboxInstanceStore,
  SandboxInstanceRecord,
} from './instance-store'

// Portable immutable sandbox checkpoint metadata.
export {
  SandboxCheckpointError,
  SandboxCheckpointConflictError,
  SandboxCheckpointDuplicateIdError,
  SandboxCheckpointInvalidIdError,
  SandboxCheckpointInvalidEntryError,
  SandboxCheckpointParentMismatchError,
  SandboxCheckpointNotHeadError,
  SandboxCheckpointWriterConflictError,
  SandboxCheckpointWriterLostError,
  isForkCapableSandboxCheckpointStore,
  InMemorySandboxCheckpointStore,
  defineSandboxCheckpointStore,
} from './checkpoint-store'

export type {
  SandboxCheckpoint,
  SandboxCheckpointStore,
  SandboxSnapshotEntry,
  SandboxSnapshotFileEntry,
  SandboxSnapshotDirectoryEntry,
  SandboxSnapshotArtifact,
  SandboxCheckpointErrorCode,
  SandboxCheckpointWriter,
  SandboxCheckpointWriterLease,
  SandboxCheckpointStoreOptions,
  SandboxCheckpointForkInput,
  SandboxCheckpointForkCapability,
  ForkCapableSandboxCheckpointStore,
} from './checkpoint-store'

// File snapshot policy used by provider snapshot create/restore inputs.
export { SandboxSnapshotError, defaultSandboxSnapshotPolicy } from './snapshots'
export type {
  SandboxSnapshotErrorCode,
  SandboxSnapshotPolicy,
} from './snapshots'
export { memorySandboxSnapshots } from './memory-snapshots'
export type {
  MemorySandboxSnapshots,
  MemorySandboxSnapshotsOptions,
} from './memory-snapshots'
export { createSandboxSnapshots } from './snapshot-operations'
export type {
  CreateSandboxSnapshotsInput,
  ForkSandboxSnapshotInput,
  ReadSandboxSnapshotArtifactInput,
  SandboxSnapshots,
  SaveSandboxSnapshotInput,
  SnapshotPersistence,
} from './snapshot-operations'
export { createSnapshotTools } from './snapshot-tools'
export type { CreateSnapshotToolsOptions } from './snapshot-tools'

// Workspace projection capability (provided by withSandbox, consumed by harness adapters)
export {
  ProjectionCapability,
  getWorkspaceProjection,
  provideWorkspaceProjection,
} from './projection'
export type { WorkspaceProjection } from './projection'

// Middleware
export { withSandbox } from './middleware'
export type { SandboxMiddlewareOptions } from './middleware'

export { isSandboxToolCall } from './tool-history'

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
  SandboxFsStat,
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
  discoverSkillDirs,
  formatWorkspaceScriptsSection,
  mergeAgentsContent,
} from './agents-file'
export type { DiscoveredSkillDir } from './agents-file'

// Exec-backed git helper (for providers without native git)
export { createExecBackedGit } from './git-exec'

// Harness runner: spawn an agent CLI in a sandbox + stream NDJSON stdout
export {
  spawnNdjson,
  toLines,
  startJournaledAgent,
  readJournalNdjson,
} from './runner'
export type { SpawnNdjsonOptions, JournalOptions } from './runner'

export {
  DEFAULT_JOURNAL_DIR,
  encodeRunId,
  EXIT_SENTINEL_KEY,
  EXIT_SENTINEL_NONCE_KEY,
  exitSentinelLine,
  parseExitSentinel,
  journalPaths,
  journaledCommand,
  journalFollowCommand,
  journalReadCommand,
  journalExistsCommand,
  journalListCommand,
  journalMtimeListCommand,
  parseJournalMtimeListing,
  journalExitProbeCommand,
  parseJournalExit,
  decodeJournalRunId,
} from './journal'
export type {
  JournalPaths,
  JournalMtimeListing,
  JournalDirEntry,
  DecodedJournalRunId,
} from './journal'

export {
  pruneJournals,
  DEFAULT_ORPHAN_TTL_MS,
  DEFAULT_MAX_DELETES,
} from './journal-sweep'
export type {
  PruneJournalsOptions,
  PruneJournalsResult,
  KeptJournal,
  KeptJournalReason,
  PruneJournalsFailure,
} from './journal-sweep'

export {
  reapDetachedRuns,
  probeRunExit,
  DEFAULT_RUN_BUDGET_MS,
  DEFAULT_MAX_RUNS,
  DEFAULT_EXIT_PROBE_BYTES,
} from './reap'
export type {
  RunExitProbe,
  ReapRunOutcome,
  ReapRunEntry,
  ReapResult,
  ReapOptions,
} from './reap'

// Sandbox reclaim: tear down the sandbox behind a terminal run.
// `sandboxReclaimer` adapts `reclaimSandbox` to `ReapOptions.reclaim`.
export {
  reclaimSandbox,
  sandboxReclaimer,
  SandboxReclaimFailedError,
} from './reclaim'
export type { ReclaimOutcome, ReclaimSandboxOptions } from './reclaim'
export {
  DEFAULT_JOURNAL_POLL_MS,
  journalReadStrategy,
  readJournal,
} from './journal-reader'
export type { ReadJournalOptions } from './journal-reader'
export { decodeBase64Stream, toJournalLines } from './journal-bytes'
export type { JournalLine } from './journal-bytes'
export {
  createRunScopedIdGen,
  chunkFingerprint,
  chunkFingerprintIgnoringThreadId,
  chunkThreadId,
} from './chunk-identity'
export {
  alignToStoredLog,
  isBridgeCustomChunk,
  JournalReplayDivergedError,
  JournalReplayThreadIdMismatchError,
  DEFAULT_MAX_OUT_OF_BAND_SKIP,
} from './align'
export type { AlignToStoredLogOptions } from './align'

export {
  awaitAttachableJournal,
  JournalAttachUnavailableError,
  DEFAULT_ATTACH_JOURNAL_WAIT_MS,
  DEFAULT_ATTACH_PROBE_INTERVAL_MS,
} from './attach-preflight'
export type {
  AttachUnavailableReason,
  AwaitAttachableJournalOptions,
} from './attach-preflight'

export {
  SandboxDurabilityCapability,
  getSandboxDurability,
  provideSandboxDurability,
  DurableAttachNotSupportedError,
  DurableRunIdRequiredError,
  DurableThreadIdRequiredError,
  resolveDurableRunId,
  resolveDurableThreadId,
  journalOptionsFor,
  alignedIfAttaching,
} from './durability'
export type {
  SandboxDurabilityOptions,
  SandboxDurabilityLog,
  SandboxRunDurability,
} from './durability'

export { sandboxRunDriver, RunDriverPipeOutsideClaimError } from './driver'
export type { SandboxRunDriverOptions } from './driver'
export {
  RunClaimNotAcquiredError,
  RunClaimLostError,
  DEFAULT_FENCE_QUIET_MS,
} from './claim'

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

export { pipeToRunLog, RunController } from './run'
export type {
  RunDeps,
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
