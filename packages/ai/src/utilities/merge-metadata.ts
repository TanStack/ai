import type { TanStackMessageMetadata, TanStackRunMetadata } from '../types'

export type MetadataRecord = Record<string, any>

/** `metadata.tanstack` on a message or run event. Internal getter return type. */
export type TanStackMetadata = TanStackMessageMetadata & TanStackRunMetadata

function isPlainRecord(value: unknown): value is MetadataRecord {
  return value != null && typeof value === 'object' && !Array.isArray(value)
}

export function mergeMetadata(
  current: MetadataRecord | undefined,
  incoming: MetadataRecord | null | undefined,
): MetadataRecord | undefined {
  if (incoming == null) return current
  if (current == null) return { ...incoming }
  const merged: MetadataRecord = { ...current, ...incoming }
  const bothTanstackRecords =
    isPlainRecord(current.tanstack) && isPlainRecord(incoming.tanstack)
  if (bothTanstackRecords) {
    merged.tanstack = { ...current.tanstack, ...incoming.tanstack }
  }
  return merged
}

/** Read `metadata.tanstack`. Not part of the public SDK surface. */
export function tanstackMetadata(
  value: { metadata?: MetadataRecord | null } | MetadataRecord | undefined,
): TanStackMetadata | undefined {
  if (value == null) return undefined
  const nested = 'metadata' in value ? value.metadata : undefined
  const metadata =
    nested != null && typeof nested === 'object' && !Array.isArray(nested)
      ? nested
      : (value as MetadataRecord)
  const tanstack = metadata.tanstack
  if (
    tanstack == null ||
    typeof tanstack !== 'object' ||
    Array.isArray(tanstack)
  ) {
    return undefined
  }
  return tanstack as TanStackMetadata
}

export function withTanstackMetadata<T>(
  value: T & { metadata?: MetadataRecord | null },
  tanstack: MetadataRecord,
): Omit<T, 'metadata'> & { metadata: MetadataRecord } {
  const current = value.metadata
  const currentTanstack = tanstackMetadata(value) ?? {}
  return {
    ...value,
    metadata: {
      ...(current ?? {}),
      tanstack: { ...currentTanstack, ...tanstack },
    },
  }
}
