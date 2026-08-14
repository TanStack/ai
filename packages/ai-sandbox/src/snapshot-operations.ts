import {
  captureSandboxArtifacts,
  captureSandboxFiles,
  defaultSandboxSnapshotPolicy,
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

type SnapshotPersistence = {
  stores: {
    messages: {
      loadThread: (threadId: string) => Promise<ReadonlyArray<ModelMessage>>
    }
    artifacts: NonNullable<SandboxSnapshotBundle['artifacts']>
    blobs: SandboxSnapshotBundle['blobs']
  }
}

export interface SandboxSnapshots {
  persistence: SnapshotPersistence
  checkpoints: SandboxCheckpointStore
  policy?: SandboxSnapshotPolicy
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
        if (!stopped && renewalFailure === undefined) scheduleRenewal()
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
  if (supplied === undefined) return defaultSandboxSnapshotPolicy(workspaceHash)
  const suppliedWorkspaceHash = supplied.workspaceHash
  const include = supplied.include
  const exclude = supplied.exclude
  const redact = supplied.redact
  return {
    ...(suppliedWorkspaceHash === undefined
      ? {}
      : { workspaceHash: suppliedWorkspaceHash }),
    ...(workspaceHash === undefined ? {} : { workspaceHash }),
    ...(include === undefined ? {} : { include }),
    ...(exclude === undefined ? {} : { exclude }),
    ...(redact === undefined ? {} : { redact }),
  }
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

export async function saveNamedSandboxSnapshot(input: {
  definition: SandboxDefinition
  threadId: string
  runId: string
  instances: SandboxInstanceStore
  snapshots: SandboxSnapshots
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
  const snapshots = input.snapshots
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
  const persistence = snapshots.persistence
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
  const checkpoints = snapshots.checkpoints
  const acquireWriter = checkpoints.acquireWriter.bind(checkpoints)
  const getHead = checkpoints.getHead.bind(checkpoints)
  const append = checkpoints.append.bind(checkpoints)
  const policy = effectivePolicy(
    snapshots.policy,
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

export async function forkFromSandboxSnapshot(input: {
  sourceThreadId: string
  sourceCheckpointId: string
  destinationThreadId: string
  snapshots: SandboxSnapshots
  destinationCheckpointId?: string
  createdAt?: number
}): Promise<SandboxCheckpoint> {
  const sourceThreadId = input.sourceThreadId
  const sourceCheckpointId = input.sourceCheckpointId
  const destinationThreadId = input.destinationThreadId
  const snapshots = input.snapshots
  const suppliedDestinationCheckpointId = input.destinationCheckpointId
  const suppliedCreatedAt = input.createdAt
  const destinationCheckpointId =
    suppliedDestinationCheckpointId ?? crypto.randomUUID()
  const createdAt = suppliedCreatedAt ?? Date.now()
  const checkpoints = snapshots.checkpoints
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

export async function resolveSnapshotArtifact(input: {
  threadId: string
  checkpointId: string
  artifactId: string
  snapshots: SandboxSnapshots
}): Promise<{
  artifact: SandboxCheckpoint['artifacts'][number]
  bytes: Uint8Array
}> {
  const threadId = input.threadId
  const checkpointId = input.checkpointId
  const artifactId = input.artifactId
  const snapshots = input.snapshots
  const checkpoints = snapshots.checkpoints
  const getCheckpoint = checkpoints.get.bind(checkpoints)
  const persistence = snapshots.persistence
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
  if (
    bytes.byteLength !== artifact.size ||
    artifact.blobKey !== `sandbox-artifacts/sha256/${await sha256(bytes)}`
  )
    throw new SandboxSnapshotError(
      'SANDBOX_SNAPSHOT_INVALID_ARTIFACT_BYTES',
      'Snapshot artifact bytes do not match metadata',
    )
  return { artifact: { ...artifact }, bytes: bytes.slice() }
}
