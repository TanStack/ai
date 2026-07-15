function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : undefined
}

/** Extract the provider OpenRouter selected, when routing metadata is present. */
export function extractServedProvider(value: unknown): string | undefined {
  const response = asRecord(value)
  const metadata = asRecord(
    response?.openrouterMetadata ?? response?.openrouter_metadata,
  )
  const endpoints = asRecord(metadata?.endpoints)
  const available = endpoints?.available

  if (!Array.isArray(available)) return undefined

  for (const endpoint of available) {
    const record = asRecord(endpoint)
    if (record?.selected === true && typeof record.provider === 'string') {
      return record.provider
    }
  }

  return undefined
}
