import type {
  AIPersistence,
  ArtifactRecord,
  BlobGetOptions,
  BlobObject,
} from './types'

/**
 * Look up a persisted generation artifact's metadata by id. Returns `null` when
 * the persistence has no `artifacts` store or no record matches — so a serve
 * handler can map that straight to a 404.
 */
export async function retrieveArtifact(
  persistence: AIPersistence,
  artifactId: string,
): Promise<ArtifactRecord | null> {
  const record = await persistence.stores.artifacts?.get(artifactId)
  return record ?? null
}

/**
 * Look up a persisted generation artifact's stored bytes. Pass an `artifactId`
 * (resolved to its record first) or an already-loaded {@link ArtifactRecord}
 * (no second metadata lookup). Returns `null` when the artifact, its record, or
 * its blob is missing, or the stores are not configured.
 *
 * Pass `options.range` to read one slice — how a serve route answers a `Range`
 * request with `206` + `Content-Range` instead of the whole file, which is what
 * `<video>` seeking is built on. Resolve the range against `record.size` and
 * reply `416` yourself when it does not fit; the store is handed satisfiable
 * ranges only. The returned object's `range` reports the slice actually served.
 */
export async function retrieveBlob(
  persistence: AIPersistence,
  artifact: string | ArtifactRecord,
  options?: BlobGetOptions,
): Promise<BlobObject | null> {
  const record =
    typeof artifact === 'string'
      ? await retrieveArtifact(persistence, artifact)
      : artifact
  if (!record) return null
  // A 0.x record has no `blobKey`. Fail loudly instead of a misleading 404.
  if (!record.blobKey) {
    throw new Error(
      `Artifact ${record.artifactId} has no blobKey. Records written by 0.x need blob_key backfilled before their bytes can be read.`,
    )
  }

  const blob = await persistence.stores.blobs?.get(record.blobKey, options)
  return blob ?? null
}
