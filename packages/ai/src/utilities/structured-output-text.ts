/**
 * Parse JSON from a model/harness assistant string.
 * Strips a wrapping markdown fence when the whole payload is fenced.
 * If the model wrote prose first, take the last JSON object or array.
 */
export function parseJsonFromAssistantText(raw: string): unknown {
  const trimmed = raw.trim()
  if (trimmed === '') {
    throw new SyntaxError('Assistant text is empty')
  }

  const candidates: Array<string> = []
  const wholeFence = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/)
  if (wholeFence?.[1]) candidates.push(wholeFence[1].trim())
  candidates.push(trimmed)
  const lastFence = [...trimmed.matchAll(/```(?:json)?\s*([\s\S]*?)\s*```/g)].at(
    -1,
  )
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
  let end = -1
  for (let i = text.length - 1; i >= 0; i--) {
    if (text[i] === '}' || text[i] === ']') {
      end = i
      break
    }
  }
  if (end < 0) return undefined
  for (let start = end; start >= 0; start--) {
    const opener = text[start]
    if (opener !== '{' && opener !== '[') continue
    const slice = text.slice(start, end + 1)
    try {
      JSON.parse(slice)
      return slice
    } catch {
      // Try an earlier opener. Nested braces often fail until the real start.
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
