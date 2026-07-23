import type { AIPersistence, ArtifactRecord, BlobObject } from './types'

/**
 * The blob-store key a generation artifact's bytes are stored under.
 * `withGenerationPersistence` writes bytes to this key; `retrieveBlob` reads
 * from it. Keep the two in lockstep by using this helper on both sides.
 */
export function artifactBlobKey(
  ref: Pick<ArtifactRecord, 'runId' | 'artifactId'>,
): string {
  return `artifacts/${ref.runId}/${ref.artifactId}`
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
 */
export async function retrieveBlob(
  persistence: AIPersistence,
  artifact: string | ArtifactRecord,
): Promise<BlobObject | null> {
  const record =
    typeof artifact === 'string'
      ? await retrieveArtifact(persistence, artifact)
      : artifact
  if (!record) return null

  const blob = await persistence.stores.blobs?.get(artifactBlobKey(record))
  return blob ?? null
}
