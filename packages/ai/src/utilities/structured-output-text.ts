/**
 * Parse JSON from a model/harness assistant string.
 * Strips a wrapping markdown fence when the whole payload is fenced.
 */
export function parseJsonFromAssistantText(raw: string): unknown {
  const trimmed = raw.trim()
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/)
  const payload = (fenced?.[1] ?? trimmed).trim()
  return JSON.parse(payload)
}

export function appendOutputSchemaInstruction(
  prompt: string,
  schema: unknown,
): string {
  return `${prompt}

Respond with a single JSON object that matches this JSON Schema. Do not wrap the object in markdown unless you must.

${JSON.stringify(schema)}`
}
