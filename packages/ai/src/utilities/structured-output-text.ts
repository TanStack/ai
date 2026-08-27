export function parseJsonFromAssistantText(raw: string): unknown {
  const trimmed = raw.trim()
  if (trimmed === '') {
    throw new SyntaxError('Assistant text is empty')
  }

  const candidates: Array<string> = []
  const wholeFence = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/)
  if (wholeFence?.[1]) candidates.push(wholeFence[1].trim())
  candidates.push(trimmed)
  const lastFence = [
    ...trimmed.matchAll(/```(?:json)?\s*([\s\S]*?)\s*```/g),
  ].at(-1)
  if (lastFence?.[1]) candidates.push(lastFence[1].trim())
  const extracted = extractLastJsonSlice(trimmed)
  if (extracted !== undefined) candidates.push(extracted)

  let lastError: unknown
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate)
    } catch (error) {
      lastError = error
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new SyntaxError('No JSON object found in assistant text')
}

function extractLastJsonSlice(text: string): string | undefined {
  for (let end = text.length - 1; end >= 0; end--) {
    const hasText = text[end] !== '}' && text[end] !== ']'
    if (hasText) continue
    for (let start = end; start >= 0; start--) {
      const opener = text[start]
      const hasOpener = opener !== '{' && opener !== '['
      if (hasOpener) continue
      const slice = text.slice(start, end + 1)
      try {
        JSON.parse(slice)
        return slice
      } catch {
        // Try an earlier opener, then an earlier closer.
      }
    }
  }
  return undefined
}

export function appendOutputSchemaInstruction(
  prompt: string,
  schema: unknown,
): string {
  return `${prompt}

Respond with a single JSON object that matches this JSON Schema. Do not wrap the object in markdown unless you must.

${JSON.stringify(schema)}`
}
