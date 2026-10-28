import { describe, expect, it } from 'vitest'
import type { ModelMessage } from '@tanstack/ai'
import type {
  ForkCapableSandboxCheckpointStore,
  SandboxCheckpoint,
  SandboxCheckpointForkInput,
  SandboxCheckpointWriter,
  SandboxCheckpointWriterLease,
} from '../checkpoint-store'
import { InMemorySandboxCheckpointStore } from '../checkpoint-store'

/** Combined stores required to exercise an atomic checkpoint fork. */
export interface SandboxCheckpointForkConformanceInput {
  persistence: {
    stores: {
      messages: {
        loadThread: (threadId: string) => Promise<Array<ModelMessage>>
        saveThread: (
          threadId: string,
          messages: Array<ModelMessage>,
        ) => Promise<void>
      }
    }
  }
  checkpoints: ForkCapableSandboxCheckpointStore
}

export interface SandboxCheckpointForkConformanceFactory {
  ():
    | SandboxCheckpointForkConformanceInput
    | Promise<SandboxCheckpointForkConformanceInput>
}

type ForkInputWithoutWriter = Omit<SandboxCheckpointForkInput, 'writer'>

function sourceCheckpoint(): SandboxCheckpoint {
  return {
    id: 'source-root',
    threadId: 'source',
    parentCheckpointId: null,
    createdAt: 10,
    reason: 'named',
    label: 'source label',
    sourceRunId: 'run-1',
    files: [
      {
        path: 'a.txt',
        kind: 'file',
        blobKey: `sandbox-files/sha256/${'a'.repeat(64)}`,
        size: 1,
      },
    ],
    conversation: [{ role: 'user', content: 'checkpoint conversation' }],
    artifacts: [],
  }
}

async function appendSource(
  checkpoints: ForkCapableSandboxCheckpointStore,
): Promise<{
  source: SandboxCheckpoint
  sourceWriter: SandboxCheckpointWriterLease
}> {
  const sourceWriter = await checkpoints.acquireWriter('source')
  const source = sourceCheckpoint()
  await checkpoints.append({
    checkpoint: source,
    expectedHeadId: null,
    writer: sourceWriter,
  })
  return { source, sourceWriter }
}

function forkInput(
  writer: SandboxCheckpointWriter,
  overrides: Partial<ForkInputWithoutWriter> = {},
): SandboxCheckpointForkInput {
  return {
    sourceThreadId: 'source',
    sourceCheckpointId: 'source-root',
    destinationThreadId: 'destination',
    destinationCheckpointId: 'fork-root',
    createdAt: 20,
    writer,
    ...overrides,
  }
}

async function destinationState(
  persistence: SandboxCheckpointForkConformanceInput['persistence'],
  checkpoints: ForkCapableSandboxCheckpointStore,
) {
  return {
    transcript: await persistence.stores.messages.loadThread('destination'),
    head: await checkpoints.getHead('destination'),
    checkpoints: await checkpoints.list('destination'),
    references: await checkpoints.listBlobReferences(),
  }
}

async function expectRejectedWithoutDestinationChanges(
  persistence: SandboxCheckpointForkConformanceInput['persistence'],
  checkpoints: ForkCapableSandboxCheckpointStore,
  operation: Promise<unknown>,
  code: string,
): Promise<void> {
  const before = await destinationState(persistence, checkpoints)
  await expect(operation).rejects.toMatchObject({ code })
  expect(await destinationState(persistence, checkpoints)).toEqual(before)
}

export function runSandboxCheckpointForkConformance(
  name: string,
  makeSnapshots: SandboxCheckpointForkConformanceFactory,
): void {
  describe(`Sandbox checkpoint fork conformance: ${name}`, () => {
    it('copies a selected historical checkpoint and creates an exact fork root', async () => {
      const { persistence, checkpoints } = await makeSnapshots()
      const { source, sourceWriter } = await appendSource(checkpoints)
      await checkpoints.append({
        checkpoint: {
          id: 'source-head',
          threadId: 'source',
          parentCheckpointId: source.id,
          createdAt: 11,
          reason: 'automatic',
          files: [],
          conversation: [{ role: 'user', content: 'newer conversation' }],
          artifacts: [],
        },
        expectedHeadId: source.id,
        writer: sourceWriter,
      })
      await persistence.stores.messages.saveThread('source', [
        { role: 'user', content: 'current source message' },
      ])
      const destinationWriter = await checkpoints.acquireWriter('destination')
      const result = await checkpoints.forkFromCheckpoint(
        forkInput(destinationWriter),
      )
      expect(result.checkpoint).toEqual({
        id: 'fork-root',
        threadId: 'destination',
        parentCheckpointId: null,
        createdAt: 20,
        reason: 'fork-root',
        files: source.files,
        conversation: source.conversation,
        artifacts: [],
      })
      expect(
        await persistence.stores.messages.loadThread('destination'),
      ).toEqual(source.conversation)
      expect(await checkpoints.getHead('source')).toBe('source-head')
    })

    it('rejects a plain checkpoint store because it has no fork capability', () => {
      const store = new InMemorySandboxCheckpointStore()
      expect('forkFromCheckpoint' in store).toBe(false)
    })

    it('rejects a missing source without changing the destination', async () => {
      const { persistence, checkpoints } = await makeSnapshots()
      const writer = await checkpoints.acquireWriter('destination')
      await expectRejectedWithoutDestinationChanges(
        persistence,
        checkpoints,
        checkpoints.forkFromCheckpoint(
          forkInput(writer, { sourceCheckpointId: 'missing' }),
        ),
        'SANDBOX_SNAPSHOT_FORK_SOURCE_NOT_FOUND',
      )
    })

    it('rejects a source thread mismatch without changing the destination', async () => {
      const { persistence, checkpoints } = await makeSnapshots()
      await appendSource(checkpoints)
      const writer = await checkpoints.acquireWriter('destination')
      await expectRejectedWithoutDestinationChanges(
        persistence,
        checkpoints,
        checkpoints.forkFromCheckpoint(
          forkInput(writer, { sourceThreadId: 'another-source' }),
        ),
        'SANDBOX_SNAPSHOT_FORK_SOURCE_THREAD_MISMATCH',
      )
    })

    it('rejects equal source and destination threads without changing the source', async () => {
      const { persistence, checkpoints } = await makeSnapshots()
      const { source, sourceWriter } = await appendSource(checkpoints)
      const before = {
        transcript: await persistence.stores.messages.loadThread('source'),
        head: await checkpoints.getHead('source'),
        checkpoints: await checkpoints.list('source'),
        references: await checkpoints.listBlobReferences(),
      }
      await expect(
        checkpoints.forkFromCheckpoint(
          forkInput(sourceWriter, {
            destinationThreadId: source.threadId,
          }),
        ),
      ).rejects.toMatchObject({
        code: 'SANDBOX_SNAPSHOT_FORK_SOURCE_THREAD_MISMATCH',
      })
      expect({
        transcript: await persistence.stores.messages.loadThread('source'),
        head: await checkpoints.getHead('source'),
        checkpoints: await checkpoints.list('source'),
        references: await checkpoints.listBlobReferences(),
      }).toEqual(before)
    })

    it('rejects a missing destination writer without changing the destination', async () => {
      const { persistence, checkpoints } = await makeSnapshots()
      await appendSource(checkpoints)
      const missingWriter: SandboxCheckpointWriter = {
        threadId: 'destination',
        ownerToken: 'missing-owner',
        fence: 1,
      }
      await expectRejectedWithoutDestinationChanges(
        persistence,
        checkpoints,
        checkpoints.forkFromCheckpoint(forkInput(missingWriter)),
        'SANDBOX_SNAPSHOT_WRITER_LOST',
      )
    })

    it('rejects a wrong destination writer without changing the destination', async () => {
      const { persistence, checkpoints } = await makeSnapshots()
      await appendSource(checkpoints)
      const wrongWriter = await checkpoints.acquireWriter('another-thread')
      await expectRejectedWithoutDestinationChanges(
        persistence,
        checkpoints,
        checkpoints.forkFromCheckpoint(forkInput(wrongWriter)),
        'SANDBOX_SNAPSHOT_WRITER_LOST',
      )
    })

    it('rejects a stale destination writer without changing the destination', async () => {
      const { persistence, checkpoints } = await makeSnapshots()
      await appendSource(checkpoints)
      const staleWriter = await checkpoints.acquireWriter('destination')
      await staleWriter.release()
      await expectRejectedWithoutDestinationChanges(
        persistence,
        checkpoints,
        checkpoints.forkFromCheckpoint(forkInput(staleWriter)),
        'SANDBOX_SNAPSHOT_WRITER_LOST',
      )
    })

    it('rejects a destination transcript without changing its checkpoint state', async () => {
      const { persistence, checkpoints } = await makeSnapshots()
      await appendSource(checkpoints)
      await persistence.stores.messages.saveThread('destination', [
        { role: 'user', content: 'already here' },
      ])
      const writer = await checkpoints.acquireWriter('destination')
      await expectRejectedWithoutDestinationChanges(
        persistence,
        checkpoints,
        checkpoints.forkFromCheckpoint(forkInput(writer)),
        'SANDBOX_SNAPSHOT_FORK_DESTINATION_NOT_EMPTY',
      )
    })

    it('rejects an orphaned checkpoint id without changing the destination', async () => {
      const { persistence, checkpoints } = await makeSnapshots()
      const { source } = await appendSource(checkpoints)
      const orphanWriter = await checkpoints.acquireWriter('orphan-thread')
      await checkpoints.append({
        checkpoint: {
          ...source,
          id: 'orphaned-id',
          threadId: 'orphan-thread',
          parentCheckpointId: null,
          createdAt: 11,
        },
        expectedHeadId: null,
        writer: orphanWriter,
      })
      const destinationWriter = await checkpoints.acquireWriter('destination')
      await expectRejectedWithoutDestinationChanges(
        persistence,
        checkpoints,
        checkpoints.forkFromCheckpoint(
          forkInput(destinationWriter, {
            destinationCheckpointId: 'orphaned-id',
          }),
        ),
        'SANDBOX_SNAPSHOT_FORK_DESTINATION_NOT_EMPTY',
      )
    })
  })
}
