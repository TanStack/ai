import { resolveArtifactBlobKey } from '@tanstack/ai-persistence'
import { CHECKPOINT_NAMESPACE } from './log'
import { uploadBlobPrefix } from './media'
import { USAGE } from './session/helpers'
import type { ArtifactStore, BlobStore } from '@tanstack/ai-persistence'
import type { HarnessPersistence } from './host'

/** The metadata rows that a purge deletes for a thread, keyed by its store key. */
const THREAD_METADATA = [USAGE, 'harness:revert']

/**
 * Delete the stored data of one thread: its log (with its settings, config,
 * plugin state, interrupted turn, runs, and interrupts), its media, and the
 * harness metadata rows. `storeId` is the store key of the thread, from `logIdOf`. It is also
 * the store id of the thread's own log. A store the persistence does not
 * have is skipped.
 */
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
  const { log, metadata } = stores
  await log.deleteLog({ logId: storeId })

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
