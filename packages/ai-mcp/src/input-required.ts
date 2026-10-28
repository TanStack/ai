/**
 * Thrown when an MCP call needs input outside `chat()`.
 *
 * `kind` is `form` for user input, or `sampling` for a model request.
 * `request` is the MCP input request body.
 * The `name` is always `MCPInputRequiredError`.
 * Another package can read this shape without an import of this class.
 *
 * @param kind - `form` for user input, or `sampling` for a model request
 * @param request - The MCP input request body
 *
 * @example
 * throw new MCPInputRequiredError('form', { message: 'Which city?' })
 */
export class MCPInputRequiredError extends Error {
  constructor(
    public readonly kind: 'form' | 'sampling',
    public readonly request: unknown,
  ) {
    super('The MCP server asked for input. Retry the call with the result.')
    this.name = 'MCPInputRequiredError'
  }
}

/**
 * This function returns true when `value` has the input-required error shape.
 *
 * The check reads `name`, `kind`, and `request`.
 * A plain object with those fields passes.
 * The check does not use `instanceof`.
 *
 * @param value - A thrown value, or a plain object
 *
 * @example
 * if (isMCPInputRequiredError(error)) {
 *   error.kind
 * }
 */
export function isMCPInputRequiredError(
  value: unknown,
): value is MCPInputRequiredError {
  if (typeof value !== 'object' || value === null) return false
  if (!('name' in value) || value.name !== 'MCPInputRequiredError') {
    return false
  }
  if (!('kind' in value)) return false

  const kindIsFormOrSampling =
    value.kind === 'form' || value.kind === 'sampling'
  if (!kindIsFormOrSampling) return false

  return 'request' in value
}
