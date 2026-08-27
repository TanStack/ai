import type {
  AIPersistence,
  ArtifactRecord,
  BlobGetOptions,
  BlobObject,
} from './types'

export function artifactBlobKey(
  ref: Pick<ArtifactRecord, 'runId' | 'artifactId'>,
): string {
  return `artifacts/${ref.runId}/${ref.artifactId}`
}

export function resolveArtifactBlobKey(record: ArtifactRecord): string {
  return record.blobKey ?? artifactBlobKey(record)
}

export async function retrieveArtifact(
  persistence: AIPersistence,
  artifactId: string,
): Promise<ArtifactRecord | null> {
  const record = await persistence.stores.artifacts?.get(artifactId)
  return record ?? null
}

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
