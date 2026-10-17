import { resolveArtifactBlobKey } from '@tanstack/ai-persistence'
import { CHECKPOINT_NAMESPACE } from './log'
import { uploadBlobPrefix } from './media'
import { INTERRUPTED, SETTINGS, USAGE } from './session/helpers'
import type { ArtifactStore, BlobStore } from '@tanstack/ai-persistence'
import type { HarnessPersistence } from './host'

/** The metadata rows the harness keeps for a thread, keyed by its store key. */
const THREAD_METADATA = [
  SETTINGS,
  'harness:config',
  INTERRUPTED,
  USAGE,
  'harness:revert',
]

/**
 * Delete the stored data of one thread: its log (or its messages on a host
 * with no log), its media, and the harness metadata rows. `storeId` is the
 * store key of the thread, from `logIdOf`. It is also the store id of the
 * thread's own log. A store the persistence does not have is skipped.
 */
// ponytail: plugin state, runs, interrupts, the inbox, and work claims stay.
// PR 5 moves them into the log or removes them, so `deleteLog` covers them.
export async function purgeThreadData({
  storeId,
  stores,
  media,
}: {
  storeId: string
  stores: HarnessPersistence['stores']
  /** The media stores of the host, which can be memory stores. */
  media: { artifacts: ArtifactStore; blobs: BlobStore }
}) {
  const { log, messages, metadata } = stores
  if (log) await log.deleteLog({ logId: storeId })
  else await messages?.saveThread(storeId, [])

  // Uploads and generated media are both artifacts of the thread.
  const records = await media.artifacts.listForThread(storeId)
  for (const record of records) {
    await media.blobs.delete(resolveArtifactBlobKey(record))
    await media.artifacts.delete(record.artifactId)
  }
  // Upload bytes with no record: a put that failed after the bytes.
  const prefix = uploadBlobPrefix(storeId)
  let cursor: string | undefined
  do {
    const page = await media.blobs.list({
      prefix,
      ...(cursor !== undefined ? { cursor } : {}),
    })
    for (const object of page.objects) await media.blobs.delete(object.key)
    cursor = page.truncated ? page.cursor : undefined
  } while (cursor !== undefined)

  if (!metadata) return
  for (const namespace of THREAD_METADATA) {
    await metadata.delete(namespace, storeId)
  }
  await metadata.delete(CHECKPOINT_NAMESPACE, storeId)
}
