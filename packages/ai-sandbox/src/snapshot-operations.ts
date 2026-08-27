import {
  captureSandboxArtifacts,
  captureSandboxFiles,
  resolveSandboxSnapshotPolicy,
  SandboxSnapshotError,
} from './snapshots'
import { resolveAllSecrets } from './secrets'
import { computeSandboxKey, computeWorkspaceHash } from './key'
import { stageEnsureExistingSandbox } from './sandbox'
import type { ModelMessage } from '@tanstack/ai'
import type { LockStore } from '@tanstack/ai/locks'
import type {
  SandboxCheckpoint,
  SandboxCheckpointStore,
  SandboxCheckpointWriterLease,
} from './checkpoint-store'
import type { SandboxInstanceStore } from './instance-store'
import type { SandboxDefinition } from './sandbox'
import type { SandboxSnapshotBundle, SandboxSnapshotPolicy } from './snapshots'
import type { WorkspaceDefinition } from './workspace'

export interface SnapshotPersistence {
  stores: {
    messages: {
      loadThread: (threadId: string) => Promise<ReadonlyArray<ModelMessage>>
    }
    artifacts: NonNullable<SandboxSnapshotBundle['artifacts']>
    blobs: SandboxSnapshotBundle['blobs']
  }
}

export interface CreateSandboxSnapshotsInput<
  TPersistence extends SnapshotPersistence = SnapshotPersistence,
  TCheckpoints extends SandboxCheckpointStore = SandboxCheckpointStore,
> {
  persistence: TPersistence
  checkpoints: TCheckpoints
  policy?: SandboxSnapshotPolicy
  sandbox?: SandboxDefinition
  instances?: SandboxInstanceStore
  tenant?: { userId?: string; orgId?: string }
  locks?: LockStore
}

export interface SaveSandboxSnapshotInput {
  threadId: string
  runId: string
  label: string
  sandbox?: SandboxDefinition
  instances?: SandboxInstanceStore
  tenant?: { userId?: string; orgId?: string }
  locks?: LockStore
  signal?: AbortSignal
  adapterName?: string
}

export interface ForkSandboxSnapshotInput {
  threadId: string
  checkpointId: string
  destinationThreadId: string
  destinationCheckpointId?: string
  createdAt?: number
}

export interface ReadSandboxSnapshotArtifactInput {
  threadId: string
  checkpointId: string
  artifactId: string
}

export interface SandboxSnapshots<
  TPersistence extends SnapshotPersistence = SnapshotPersistence,
  TCheckpoints extends SandboxCheckpointStore = SandboxCheckpointStore,
> {
  persistence: TPersistence
  checkpoints: TCheckpoints
  policy?: SandboxSnapshotPolicy
  save: (input: SaveSandboxSnapshotInput) => Promise<SandboxCheckpoint>
  fork: (input: ForkSandboxSnapshotInput) => Promise<SandboxCheckpoint>
  readArtifact: (input: ReadSandboxSnapshotArtifactInput) => Promise<{
    artifact: SandboxCheckpoint['artifacts'][number]
    bytes: Uint8Array
  }>
}

type Failure = { error: unknown }

async function withWriterLease<T>(
  acquire: () => Promise<SandboxCheckpointWriterLease>,
  renew: boolean,
  operation: (
    writer: SandboxCheckpointWriterLease,
    throwIfLost: () => Promise<void>,
  ) => Promise<T>,
): Promise<T> {
  const writer = await acquire()
  const release = writer.release.bind(writer)
  const renewWriter = renew ? writer.renew.bind(writer) : undefined
  const renewAfterMs = renew ? writer.renewAfterMs : undefined
  let renewalTimer: ReturnType<typeof setTimeout> | undefined
  let renewalTask: Promise<void> | undefined
  let renewalFailure: Failure | undefined
  let stopped = false

  const scheduleRenewal = (): void => {
    if (renewWriter === undefined || renewAfterMs === undefined) return
    renewalTimer = setTimeout(() => {
      renewalTimer = undefined
      renewalTask = (async () => {
        try {
          await renewWriter()
        } catch (error) {
          renewalFailure = { error }
        } finally {
          renewalTask = undefined
        }
        const shouldKeepRenewing = !stopped && renewalFailure === undefined
        if (shouldKeepRenewing) scheduleRenewal()
      })()
    }, renewAfterMs)
  }
  if (renew) scheduleRenewal()

  const throwIfLost = async (): Promise<void> => {
    await renewalTask
    if (renewalFailure !== undefined) throw renewalFailure.error
  }

  let outcome: { value: T } | undefined
  let operationFailure: Failure | undefined
  try {
    outcome = { value: await operation(writer, throwIfLost) }
  } catch (error) {
    operationFailure = { error }
  }

  stopped = true
  if (renewalTimer !== undefined) clearTimeout(renewalTimer)
  await renewalTask
  let releaseFailure: Failure | undefined
  try {
    await release()
  } catch (error) {
    releaseFailure = { error }
  }

  if (renewalFailure !== undefined) throw renewalFailure.error
  if (operationFailure !== undefined) throw operationFailure.error
  if (releaseFailure !== undefined) throw releaseFailure.error
  if (outcome === undefined) throw new Error('Writer operation had no outcome')
  return outcome.value
}

function stageWorkspace(
  workspace: WorkspaceDefinition | undefined,
): WorkspaceDefinition | undefined {
  if (workspace === undefined) return undefined
  const source = workspace.source
  const packageManager = workspace.packageManager
  const setup = workspace.setup
  const scripts = workspace.scripts
  const skills = workspace.skills
  const instructions = workspace.instructions
  const plugins = workspace.plugins
  const secrets = workspace.secrets
  const root = workspace.root
  return {
    source,
    ...(Object.hasOwn(workspace, 'packageManager') ? { packageManager } : {}),
    ...(Object.hasOwn(workspace, 'setup') ? { setup } : {}),
    ...(Object.hasOwn(workspace, 'scripts') ? { scripts } : {}),
    ...(Object.hasOwn(workspace, 'skills') ? { skills } : {}),
    ...(Object.hasOwn(workspace, 'instructions') ? { instructions } : {}),
    ...(Object.hasOwn(workspace, 'plugins') ? { plugins } : {}),
    ...(Object.hasOwn(workspace, 'secrets') ? { secrets } : {}),
    ...(Object.hasOwn(workspace, 'root') ? { root } : {}),
  }
}

function effectivePolicy(
  supplied: SandboxSnapshotPolicy | undefined,
  workspaceHash: string | undefined,
): SandboxSnapshotPolicy {
  return resolveSandboxSnapshotPolicy(supplied, workspaceHash)
}

function stageInstanceStore(store: SandboxInstanceStore): SandboxInstanceStore {
  const get = store.get.bind(store)
  const upsert = store.upsert.bind(store)
  const deleteRecord = store.delete.bind(store)
  return { get, upsert, delete: deleteRecord }
}

function stageLockStore(locks: LockStore | undefined): LockStore | undefined {
  if (locks === undefined) return undefined
  const withLock = locks.withLock.bind(locks)
  return { withLock }
}

function requireSnapshotPersistence<TPersistence extends SnapshotPersistence>(
  persistence: TPersistence,
): TPersistence {
  const stores = persistence.stores
  const lacksSnapshotStores =
    !stores?.messages || !stores.artifacts || !stores.blobs
  if (lacksSnapshotStores) {
    throw new SandboxSnapshotError(
      'SANDBOX_SNAPSHOT_MISSING_PERSISTENCE_STORES',
      'Sandbox snapshots require persistence stores.messages, stores.artifacts, and stores.blobs',
    )
  }
  return persistence
}

export function createSandboxSnapshots<
  TPersistence extends SnapshotPersistence,
  TCheckpoints extends SandboxCheckpointStore,
>(
  input: CreateSandboxSnapshotsInput<TPersistence, TCheckpoints>,
): SandboxSnapshots<TPersistence, TCheckpoints> {
  const persistence = requireSnapshotPersistence(input.persistence)
  const checkpoints = input.checkpoints
  const policy = input.policy
  const boundSandbox = input.sandbox
  const boundInstances = input.instances
  const boundTenant = input.tenant
  const boundLocks = input.locks

  return {
    persistence,
    checkpoints,
    ...(policy === undefined ? {} : { policy }),
    async save(saveInput) {
      const sandbox = saveInput.sandbox ?? boundSandbox
      const instances = saveInput.instances ?? boundInstances
      if (sandbox === undefined)
        throw new SandboxSnapshotError(
          'SANDBOX_SNAPSHOT_MISSING_SANDBOX',
          'Named snapshots require a sandbox at create time or on save',
        )
      if (instances === undefined)
        throw new SandboxSnapshotError(
          'SANDBOX_SNAPSHOT_MISSING_INSTANCES',
          'Named snapshots require instances at create time or on save',
        )
      return saveNamedSandboxSnapshot({
        definition: sandbox,
        threadId: saveInput.threadId,
        runId: saveInput.runId,
        instances,
        persistence,
        checkpoints,
        policy,
        label: saveInput.label,
        tenant: saveInput.tenant ?? boundTenant,
        locks: saveInput.locks ?? boundLocks,
        signal: saveInput.signal,
        adapterName: saveInput.adapterName,
      })
    },
    fork(forkInput) {
      return forkFromSandboxSnapshot({
        threadId: forkInput.threadId,
        checkpointId: forkInput.checkpointId,
        destinationThreadId: forkInput.destinationThreadId,
        checkpoints,
        destinationCheckpointId: forkInput.destinationCheckpointId,
        createdAt: forkInput.createdAt,
      })
    },
    readArtifact(readInput) {
      return resolveSnapshotArtifact({
        threadId: readInput.threadId,
        checkpointId: readInput.checkpointId,
        artifactId: readInput.artifactId,
        persistence,
        checkpoints,
      })
    },
  }
}

async function saveNamedSandboxSnapshot(input: {
  definition: SandboxDefinition
  threadId: string
  runId: string
  instances: SandboxInstanceStore
  persistence: SnapshotPersistence
  checkpoints: SandboxCheckpointStore
  policy?: SandboxSnapshotPolicy
  label: string
  tenant?: { userId?: string; orgId?: string }
  locks?: LockStore
  signal?: AbortSignal
  adapterName?: string
}): Promise<SandboxCheckpoint> {
  const definition = input.definition
  const threadId = input.threadId
  const runId = input.runId
  const instances = stageInstanceStore(input.instances)
  const label = input.label
  const suppliedTenant = input.tenant
  const tenantUserId = suppliedTenant?.userId
  const tenantOrgId = suppliedTenant?.orgId
  const tenant = suppliedTenant
    ? {
        ...(tenantUserId === undefined ? {} : { userId: tenantUserId }),
        ...(tenantOrgId === undefined ? {} : { orgId: tenantOrgId }),
      }
    : undefined
  const locks = stageLockStore(input.locks)
  const signal = input.signal
  const adapterName = input.adapterName
  const lifecycle = definition.lifecycle
  const reuse = lifecycle?.reuse
  const snapshotMaxAge = lifecycle?.snapshotMaxAge
  const workspace = stageWorkspace(definition.workspace)
  const sandboxId = definition.id
  const provider = definition.provider
  const providerName = provider.name
  const resume = provider.resume.bind(provider)
  const ensureExisting = stageEnsureExistingSandbox(definition)
  const persistence = input.persistence
  const stores = persistence.stores
  const messages = stores.messages
  const loadThread = messages.loadThread.bind(messages)
  const artifactStore = stores.artifacts
  const listForThread = artifactStore.listForThread.bind(artifactStore)
  const suppliedBlobs = stores.blobs
  const getBlob = suppliedBlobs.get.bind(suppliedBlobs)
  const headBlob = suppliedBlobs.head.bind(suppliedBlobs)
  const putBlob = suppliedBlobs.put.bind(suppliedBlobs)
  const blobs: SandboxSnapshotBundle['blobs'] = {
    get: getBlob,
    head: headBlob,
    put: putBlob,
  }
  const checkpoints = input.checkpoints
  const acquireWriter = checkpoints.acquireWriter.bind(checkpoints)
  const getHead = checkpoints.getHead.bind(checkpoints)
  const append = checkpoints.append.bind(checkpoints)
  const policy = effectivePolicy(
    input.policy,
    workspace === undefined ? undefined : computeWorkspaceHash(workspace),
  )
  const workspaceSecrets = workspace?.secrets
  const secrets = workspaceSecrets ? resolveAllSecrets(workspaceSecrets) : {}
  const workspaceRoot = workspace?.root
  const key = computeSandboxKey({
    threadId,
    sandboxId,
    providerName,
    workspace,
    tenant,
  })

  return withWriterLease(
    () => acquireWriter(threadId),
    true,
    async (writer, throwIfLost) => {
      if (reuse === 'none')
        throw new SandboxSnapshotError(
          'SANDBOX_SNAPSHOT_REUSE_NONE',
          'Named snapshots require a reusable sandbox lifecycle',
        )
      const handle = await ensureExisting(
        {
          threadId,
          runId,
          store: instances,
          locks,
          tenant,
          signal,
          adapterName,
        },
        {
          key,
          workspace,
          resolvedSecrets: workspaceSecrets ? secrets : undefined,
          snapshotMaxAge,
          resume,
        },
      )
      if (!handle)
        throw new SandboxSnapshotError(
          'SANDBOX_SNAPSHOT_MISSING_REUSABLE_SANDBOX',
          'Named snapshots require an existing resumable sandbox',
        )
      const conversation = await loadThread(threadId)
      const files = await captureSandboxFiles(
        handle,
        { blobs, workspaceRoot },
        policy,
        secrets,
      )
      const artifacts = await captureSandboxArtifacts(
        {
          blobs,
          artifacts: { listForThread },
        },
        threadId,
        secrets,
      )
      const parentCheckpointId = await getHead(threadId)
      await throwIfLost()
      const checkpoint: SandboxCheckpoint = {
        id: crypto.randomUUID(),
        threadId,
        parentCheckpointId,
        createdAt: Date.now(),
        reason: 'named',
        label,
        sourceRunId: runId,
        files: files.files,
        conversation,
        artifacts,
      }
      await append({
        checkpoint,
        expectedHeadId: parentCheckpointId,
        writer,
      })
      await throwIfLost()
      return checkpoint
    },
  )
}

async function forkFromSandboxSnapshot(input: {
  threadId: string
  checkpointId: string
  destinationThreadId: string
  checkpoints: SandboxCheckpointStore
  destinationCheckpointId?: string
  createdAt?: number
}): Promise<SandboxCheckpoint> {
  const sourceThreadId = input.threadId
  const sourceCheckpointId = input.checkpointId
  const destinationThreadId = input.destinationThreadId
  const suppliedDestinationCheckpointId = input.destinationCheckpointId
  const suppliedCreatedAt = input.createdAt
  const destinationCheckpointId =
    suppliedDestinationCheckpointId ?? crypto.randomUUID()
  const createdAt = suppliedCreatedAt ?? Date.now()
  const checkpoints = input.checkpoints
  const acquireWriter = checkpoints.acquireWriter.bind(checkpoints)
  const forkFromCheckpoint = checkpoints.forkFromCheckpoint?.bind(checkpoints)

  return withWriterLease(
    () => acquireWriter(destinationThreadId),
    false,
    async (writer) => {
      if (forkFromCheckpoint === undefined)
        throw new SandboxSnapshotError(
          'SANDBOX_SNAPSHOT_FORK_UNAVAILABLE',
          'The checkpoint store does not support atomic forks',
        )
      const result = await forkFromCheckpoint({
        sourceThreadId,
        sourceCheckpointId,
        destinationThreadId,
        destinationCheckpointId,
        createdAt,
        writer,
      })
      return result.checkpoint
    },
  )
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new Uint8Array(bytes))
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('')
}

async function resolveSnapshotArtifact(input: {
  threadId: string
  checkpointId: string
  artifactId: string
  persistence: SnapshotPersistence
  checkpoints: SandboxCheckpointStore
}): Promise<{
  artifact: SandboxCheckpoint['artifacts'][number]
  bytes: Uint8Array
}> {
  const threadId = input.threadId
  const checkpointId = input.checkpointId
  const artifactId = input.artifactId
  const checkpoints = input.checkpoints
  const getCheckpoint = checkpoints.get.bind(checkpoints)
  const persistence = input.persistence
  const stores = persistence.stores
  const blobs = stores.blobs
  const getBlob = blobs.get.bind(blobs)
  const checkpoint = await getCheckpoint(checkpointId)
  if (!checkpoint)
    throw new SandboxSnapshotError(
      'SANDBOX_SNAPSHOT_MISSING_CHECKPOINT_ARTIFACT',
      'Snapshot checkpoint does not exist',
    )
  const checkpointThreadId = checkpoint.threadId
  const checkpointArtifacts = checkpoint.artifacts
  if (checkpointThreadId !== threadId)
    throw new SandboxSnapshotError(
      'SANDBOX_SNAPSHOT_FOREIGN_CHECKPOINT_ARTIFACT',
      'Snapshot checkpoint belongs to another thread',
    )
  const foundArtifact = checkpointArtifacts.find(
    (value) => value.artifactId === artifactId,
  )
  if (!foundArtifact)
    throw new SandboxSnapshotError(
      'SANDBOX_SNAPSHOT_MISSING_CHECKPOINT_ARTIFACT',
      'Snapshot artifact does not exist',
    )
  const artifact = {
    artifactId: foundArtifact.artifactId,
    name: foundArtifact.name,
    mimeType: foundArtifact.mimeType,
    size: foundArtifact.size,
    blobKey: foundArtifact.blobKey,
    createdAt: foundArtifact.createdAt,
  }
  const blob = await getBlob(artifact.blobKey)
  if (!blob)
    throw new SandboxSnapshotError(
      'SANDBOX_SNAPSHOT_INVALID_ARTIFACT_BYTES',
      'Snapshot artifact blob does not exist',
    )
  const arrayBuffer = blob.arrayBuffer.bind(blob)
  const bytes = new Uint8Array(await arrayBuffer())
  const isArtifactMismatch =
    bytes.byteLength !== artifact.size ||
    artifact.blobKey !== `sandbox-artifacts/sha256/${await sha256(bytes)}`
  if (isArtifactMismatch)
    throw new SandboxSnapshotError(
      'SANDBOX_SNAPSHOT_INVALID_ARTIFACT_BYTES',
      'Snapshot artifact bytes do not match metadata',
    )
  return { artifact: { ...artifact }, bytes: bytes.slice() }
}
