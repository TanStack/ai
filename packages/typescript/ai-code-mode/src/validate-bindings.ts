/**
 * Patterns that indicate a parameter might carry a secret value.
 * Case-insensitive matching against JSON Schema property names.
 */
const SECRET_PATTERNS =
  /^(api[_-]?key|secret|token|password|credential|auth[_-]?token|access[_-]?key|private[_-]?key)$/i

interface ToolLike {
  name: string
  inputSchema?: { type?: string; properties?: Record<string, unknown> }
}

/**
 * Scan tool input schemas for parameter names that look like secrets.
 * Emits console.warn for each match so developers notice during development.
 *
 * This is a best-effort heuristic, not a security boundary.
 */
export function warnIfBindingsExposeSecrets(tools: Array<ToolLike>): void {
  for (const tool of tools) {
    const properties = tool.inputSchema?.properties
    if (!properties) continue

    for (const paramName of Object.keys(properties)) {
      if (SECRET_PATTERNS.test(paramName)) {
        console.warn(
          `[TanStack AI Code Mode] Tool "${tool.name}" has parameter "${paramName}" ` +
            `that looks like a secret. Code Mode executes LLM-generated code — any ` +
            `value passed through this parameter is accessible to generated code and ` +
            `could be exfiltrated. Keep secrets in your server-side tool implementation ` +
            `instead of passing them as tool parameters.`,
        )
      }
    }
  }
}
