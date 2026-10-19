import { resolveArtifactBlobKey } from '@tanstack/ai-persistence'
import { uploadBlobPrefix } from './media'
import type { ArtifactStore, BlobStore } from '@tanstack/ai-persistence'
import type { HarnessPersistence } from './host'

/**
 * Delete the stored data of one thread: its log (with its settings, config,
 * plugin state, interrupted turn, runs, interrupts, usage, and snapshots) and
 * its media. `storeId` is the store key of the thread, from `logIdOf`. It is
 * also the store id of the thread's own log.
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
  await stores.log.deleteLog({ logId: storeId })

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
}
