export type MetadataRecord = Record<string, any>

export function mergeMetadata(
  current: MetadataRecord | undefined,
  incoming: MetadataRecord | null | undefined,
): MetadataRecord | undefined {
  if (incoming == null) return current
  if (current == null) return { ...incoming }
  return { ...current, ...incoming }
}

export function tanstackMetadata(
  value: { metadata?: MetadataRecord | null } | MetadataRecord | undefined,
): MetadataRecord | undefined {
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
  return tanstack as MetadataRecord
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
