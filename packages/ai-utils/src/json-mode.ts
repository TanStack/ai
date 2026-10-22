/**
 * System prompt for JSON mode (`json_object`). JSON mode does not send the
 * schema, so the prompt carries it. The prompt also has the word "JSON",
 * which some providers require in JSON mode.
 */
export function jsonModeSystemPrompt(schema: unknown): string {
  return `Respond with only a JSON object that matches this JSON Schema:\n${JSON.stringify(schema)}`
}
