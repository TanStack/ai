import type {
  AIPersistence,
  ArtifactRecord,
  BlobGetOptions,
  BlobObject,
} from './types'

/**
 * The DEFAULT blob-store key a generation artifact's bytes are stored under,
 * used when `withGenerationPersistence` is given no `storageKey` mapper.
 *
 * Reads go through {@link resolveArtifactBlobKey} instead: a record written with
 * a custom `storageKey` carries its real key in `blobKey`, and recomputing the
 * default would look in the wrong place.
 *
 * @internal
 */
export function artifactBlobKey(
  ref: Pick<ArtifactRecord, 'runId' | 'artifactId'>,
): string {
  return `artifacts/${ref.runId}/${ref.artifactId}`
}

/**
 * The blob-store key to read an artifact's bytes from: the key recorded when it
 * was written, falling back to the default convention for records written
 * before `blobKey` existed.
 *
 * The fallback is what makes `blobKey` a non-breaking addition — and why the
 * default convention can never be changed retroactively without one.
 */
export function resolveArtifactBlobKey(record: ArtifactRecord): string {
  return record.blobKey ?? artifactBlobKey(record)
}

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

  const blob = await persistence.stores.blobs?.get(
    resolveArtifactBlobKey(record),
    options,
  )
  return blob ?? null
}
