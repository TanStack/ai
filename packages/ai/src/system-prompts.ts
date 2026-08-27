export type SystemPrompt<TMetadata = unknown> =
  | string
  | {
      content: string
      metadata?: TMetadata
    }

export interface NormalizedSystemPrompt<TMetadata = unknown> {
  content: string
  metadata?: TMetadata
}

export function normalizeSystemPrompts<TMetadata = unknown>(
  prompts: ReadonlyArray<SystemPrompt> | undefined,
): Array<NormalizedSystemPrompt<TMetadata>> {
  const isEmptyPrompts = !prompts || prompts.length === 0
  if (isEmptyPrompts) return []
  return prompts.map((p, i) => {
    if (typeof p === 'string') return { content: p }
    const candidate = p as unknown
    const isInvalidCandidate =
      candidate === null || typeof candidate !== 'object'
    if (isInvalidCandidate) {
      throw new TypeError(
        `systemPrompts[${i}]: expected a string or { content, metadata? }, got ${candidate === null ? 'null' : typeof candidate}`,
      )
    }
    const { content } = candidate as { content?: unknown }
    if (typeof content !== 'string') {
      throw new TypeError(
        `systemPrompts[${i}]: content must be a string, got ${typeof content}`,
      )
    }
    return p as NormalizedSystemPrompt<TMetadata>
  })
}
