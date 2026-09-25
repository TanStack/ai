import { describe, expect, it, vi } from 'vitest'
import {
  createSandboxSnapshots,
  createSnapshotTools,
  defineSandbox,
  InMemorySandboxInstanceStore,
  memorySandboxSnapshots,
} from '../src'
import { makeFakeProvider } from './fakes'
import type { SandboxSnapshots } from '../src'

const THREAD = 'thread'
const RUN = 'run'

async function liveSnapshots() {
  const memory = await memorySandboxSnapshots()
  const instances = new InMemorySandboxInstanceStore()
  const provider = makeFakeProvider()
  const sandbox = defineSandbox({ id: 'sandbox', provider })
  await instances.upsert({
    key: sandbox.key({ threadId: THREAD, runId: 'old' }),
    provider: provider.name,
    providerSandboxId: 'existing',
    threadId: THREAD,
    updatedAt: Date.now(),
  })
  const snapshots = createSandboxSnapshots({
    persistence: memory.persistence,
    checkpoints: memory.checkpoints,
    sandbox,
    instances,
  })
  return { snapshots, provider }
}

function toolsFor(
  snapshots: SandboxSnapshots,
  options: {
    createThreadId?: () => string
    onForked?: (input: {
      destinationThreadId: string
      checkpointId: string
    }) => void | Promise<void>
  } = {},
) {
  return createSnapshotTools(snapshots, {
    threadId: THREAD,
    runId: RUN,
    createThreadId: options.createThreadId ?? (() => 'destination'),
    ...(options.onForked === undefined ? {} : { onForked: options.onForked }),
  })
}

async function executeTool(
  tools: ReturnType<typeof createSnapshotTools>,
  name: string,
  input: unknown,
) {
  const tool = tools.find((candidate) => candidate.name === name)
  if (tool === undefined || tool.execute === undefined) {
    throw new Error(`Missing tool ${name}`)
  }
  return tool.execute(input)
}

describe('createSnapshotTools', () => {
  it('rejects empty factory ids', async () => {
    const { snapshots } = await liveSnapshots()
    expect(() =>
      createSnapshotTools(snapshots, {
        threadId: '',
        runId: RUN,
        createThreadId: () => 'destination',
      }),
    ).toThrow(
      expect.objectContaining({ code: 'SANDBOX_SNAPSHOT_INVALID_TOOL_INPUT' }),
    )
  })

  it('saves a named checkpoint without a model-supplied thread id', async () => {
    const { snapshots, provider } = await liveSnapshots()
    const tools = toolsFor(snapshots)
    const saveSchema = tools[0].inputSchema

    expect(saveSchema).toMatchObject({
      required: ['label'],
      additionalProperties: false,
    })
    expect(
      saveSchema &&
        typeof saveSchema === 'object' &&
        'properties' in saveSchema &&
        saveSchema.properties !== null &&
        typeof saveSchema.properties === 'object',
    ).toBe(true)
    if (
      saveSchema &&
      typeof saveSchema === 'object' &&
      'properties' in saveSchema &&
      saveSchema.properties !== null &&
      typeof saveSchema.properties === 'object'
    ) {
      expect(Object.hasOwn(saveSchema.properties, 'threadId')).toBe(false)
    }

    await expect(
      executeTool(tools, 'save_sandbox_snapshot', { label: 'release-1' }),
    ).resolves.toEqual({
      checkpointId: expect.any(String),
      label: 'release-1',
      threadId: THREAD,
    })
    expect(provider.calls).toMatchObject({ create: 0, resume: 1 })
  })

  it('rejects save while this thread already has a writer', async () => {
    const { snapshots } = await liveSnapshots()
    const writer = await snapshots.checkpoints.acquireWriter(THREAD)
    const tools = toolsFor(snapshots)

    await expect(
      executeTool(tools, 'save_sandbox_snapshot', { label: 'busy' }),
    ).rejects.toMatchObject({ code: 'SANDBOX_SNAPSHOT_WRITER_CONFLICT' })
    await writer.release()
  })

  it('forks the latest checkpoint into a minted destination thread', async () => {
    const { snapshots } = await liveSnapshots()
    const tools = toolsFor(snapshots, { createThreadId: () => 'branch-1' })
    const saved = await executeTool(tools, 'save_sandbox_snapshot', {
      label: 'base',
    })
    if (
      saved === null ||
      typeof saved !== 'object' ||
      !('checkpointId' in saved)
    ) {
      throw new Error('save did not return a checkpointId')
    }
    const sourceId = saved.checkpointId

    const forked = await executeTool(tools, 'fork_sandbox_snapshot', {})
    expect(forked).toEqual({
      checkpointId: expect.any(String),
      destinationThreadId: 'branch-1',
    })
    expect(await snapshots.checkpoints.getHead(THREAD)).toBe(sourceId)
    expect(await snapshots.checkpoints.getHead('branch-1')).not.toBeNull()
  })

  it('forks a selected checkpoint while the source writer is held', async () => {
    const { snapshots } = await liveSnapshots()
    const tools = toolsFor(snapshots, { createThreadId: () => 'branch-2' })
    const saved = await executeTool(tools, 'save_sandbox_snapshot', {
      label: 'base',
    })
    if (
      saved === null ||
      typeof saved !== 'object' ||
      !('checkpointId' in saved) ||
      typeof saved.checkpointId !== 'string'
    ) {
      throw new Error('save did not return a checkpointId')
    }
    const writer = await snapshots.checkpoints.acquireWriter(THREAD)

    await expect(
      executeTool(tools, 'fork_sandbox_snapshot', {
        checkpointId: saved.checkpointId,
      }),
    ).resolves.toMatchObject({ destinationThreadId: 'branch-2' })
    await writer.release()
  })

  it('rejects a fork when the thread has no checkpoint', async () => {
    const { snapshots } = await liveSnapshots()
    const tools = toolsFor(snapshots)

    await expect(
      executeTool(tools, 'fork_sandbox_snapshot', {}),
    ).rejects.toMatchObject({ code: 'SANDBOX_SNAPSHOT_MISSING_CHECKPOINT' })
  })

  it('calls onForked after a successful fork', async () => {
    const { snapshots } = await liveSnapshots()
    const onForked = vi.fn()
    const tools = toolsFor(snapshots, {
      createThreadId: () => 'branch-3',
      onForked,
    })
    await executeTool(tools, 'save_sandbox_snapshot', { label: 'base' })
    const forked = await executeTool(tools, 'fork_sandbox_snapshot', {})
    if (
      forked === null ||
      typeof forked !== 'object' ||
      !('checkpointId' in forked)
    ) {
      throw new Error('fork did not return a checkpointId')
    }
    expect(onForked).toHaveBeenCalledWith({
      destinationThreadId: 'branch-3',
      checkpointId: forked.checkpointId,
    })
  })

  it('reads artifact metadata from the bound thread', async () => {
    const { snapshots } = await liveSnapshots()
    const tools = toolsFor(snapshots)
    const bytes = new TextEncoder().encode('hello')
    const digest = await crypto.subtle.digest('SHA-256', new Uint8Array(bytes))
    const blobKey = `sandbox-artifacts/sha256/${Array.from(
      new Uint8Array(digest),
      (byte) => byte.toString(16).padStart(2, '0'),
    ).join('')}`
    await snapshots.persistence.stores.blobs.put(blobKey, bytes)
    const writer = await snapshots.checkpoints.acquireWriter(THREAD)
    await snapshots.checkpoints.append({
      checkpoint: {
        id: 'checkpoint',
        threadId: THREAD,
        parentCheckpointId: null,
        createdAt: 1,
        reason: 'named',
        files: [],
        conversation: [],
        artifacts: [
          {
            artifactId: 'artifact',
            name: 'file.txt',
            mimeType: 'text/plain',
            size: bytes.byteLength,
            blobKey,
            createdAt: 1,
          },
        ],
      },
      expectedHeadId: null,
      writer,
    })
    await writer.release()

    await expect(
      executeTool(tools, 'read_sandbox_snapshot_artifact', {
        checkpointId: 'checkpoint',
        artifactId: 'artifact',
      }),
    ).resolves.toEqual({
      artifactId: 'artifact',
      name: 'file.txt',
      mimeType: 'text/plain',
      size: bytes.byteLength,
      createdAt: 1,
    })
  })
})
