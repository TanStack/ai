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

// Durable instance map (resume-or-create across processes).
// Pass a store to `withSandbox(sandbox, { instances })`; the capability is the
// ambient alternative for platform-level wiring.
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
export {
  spawnNdjson,
  toLines,
  startJournaledAgent,
  readJournalNdjson,
} from './runner'
export type { SpawnNdjsonOptions, JournalOptions } from './runner'

// The agent output journal: the durability boundary for a sandboxed run.
export {
  DEFAULT_JOURNAL_DIR,
  EXIT_SENTINEL_KEY,
  journalPaths,
  journaledCommand,
  journalFollowCommand,
  journalReadCommand,
  journalExistsCommand,
} from './journal'
export type { JournalPaths } from './journal'
export {
  DEFAULT_JOURNAL_POLL_MS,
  journalReadStrategy,
  readJournal,
} from './journal-reader'
export type { ReadJournalOptions } from './journal-reader'
export { decodeBase64Stream, toJournalLines } from './journal-bytes'
export type { JournalLine } from './journal-bytes'
export { createRunScopedIdGen, chunkFingerprint } from './chunk-identity'
export {
  alignToStoredLog,
  isBridgeCustomChunk,
  JournalReplayDivergedError,
  DEFAULT_MAX_OUT_OF_BAND_SKIP,
} from './align'
export type { AlignToStoredLogOptions } from './align'

// Durability seam: the `withSandbox(sandbox, { runs, durability })` option
// shape, the capability harness adapters read back via `getSandboxDurability`,
// and the two helpers that turn a resolved durability into the pieces a
// harness adapter actually drives with — a `journalOptionsFor` journal option
// and an attach-only `alignedIfAttaching` alignment transform.
//
// `resolveSandboxDurability` and `parseRunTtlMs` are deliberately NOT
// exported: they are `withSandbox`'s own path from raw options to the
// capability payload (see `middleware.ts`), and a harness adapter only ever
// needs the ALREADY-RESOLVED value read back off the capability bus, never to
// re-run that resolution itself.
export {
  SandboxDurabilityCapability,
  getSandboxDurability,
  provideSandboxDurability,
  DEFAULT_DETACHED_RUN_TTL,
  DurableRunIdRequiredError,
  resolveDurableRunId,
  journalOptionsFor,
  alignedIfAttaching,
} from './durability'
export type {
  SandboxDurabilityOptions,
  SandboxRunDurability,
} from './durability'

// Run driver: fills in core's injected takeover seams (`claim`/`pipe`) with
// this package's single-writer claim (`claim.ts`) and run log (`run.ts`), so
// an application wires `request`/`runs`/`locks`/`durability`/`drive` instead of
// hand-rolling the claim/fence dance itself.
//
// `claim.ts`'s own primitives — `withRunClaim`, `fenceDurability`,
// `awaitLogQuiescence`, `runDriverLockKey`, and their `RunClaim` /
// `WithRunClaimOptions` types — are deliberately NOT exported. They are
// exactly the "easy to get wrong" seam `sandboxRunDriver` exists to make
// impossible (see `driver.ts`'s module doc, points 1-3), and publishing them
// would invite the same hand-rolled fencing bugs as a supported path. The two
// error classes below ARE exported despite that: both can surface through
// `sandboxRunDriver` itself, so a caller needs `instanceof` to branch on them,
// and `DEFAULT_FENCE_QUIET_MS` is exported because it is the documented
// default for `sandboxRunDriver`'s own `fenceQuietMs` option.
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

// Run driver — pumps a chat() stream into core's `StreamDurability` and
// records run status/lifecycle in core's `RunStore`, so a trigger returns
// immediately while a durable orchestrator drives the run and clients tail it.
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
