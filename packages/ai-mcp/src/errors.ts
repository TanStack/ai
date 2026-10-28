export class MCPConnectionError extends Error {
  constructor(
    message: string,
    public override readonly cause?: unknown,
  ) {
    super(message)
    this.name = 'MCPConnectionError'
  }
}

export class DuplicateToolNameError extends Error {
  constructor(public readonly toolName: string) {
    super(
      `Duplicate MCP tool name "${toolName}". Set a unique \`prefix\` on one of the ` +
        `MCP clients (createMCPClient({ transport, prefix: '...' })) to disambiguate.`,
    )
    this.name = 'DuplicateToolNameError'
  }
}

/**
 * Thrown when a task-required tool is explicitly bound via `mcp.tools([...])`,
 * called via `callTool()`, or named in a `toolFilter` list, but the server
 * does not declare the tasks capability for tools/call, so the call could
 * never execute. (Auto-discovery without a `toolFilter` list skips such tools.)
 */
export class MCPTaskRequiredToolError extends Error {
  constructor(public readonly toolName: string) {
    super(
      `MCP tool "${toolName}" requires task-based execution, but the server ` +
        `does not declare the tasks capability for tools/call`,
    )
    this.name = 'MCPTaskRequiredToolError'
  }
}

export class MCPToolNotFoundError extends Error {
  constructor(public readonly toolName: string) {
    super(
      `toolDefinition name "${toolName}" was passed to mcp.tools([...]) but the MCP ` +
        `server exposes no tool with that name, or the client's \`toolFilter\` hides it. ` +
        `Check the name or run mcp.tools() to list.`,
    )
    this.name = 'MCPToolNotFoundError'
  }
}

type ToolFilterDetails = {
  /** Listed, but the server has no tool with this name. */
  missing: Array<string>
  /** Listed more than once. */
  repeated: Array<string>
  /** The server's tool names. */
  available: Array<string>
}

function toolFilterMessage(details: ToolFilterDetails) {
  const names = (list: Array<string>) =>
    list.map((name) => `"${name}"`).join(', ')
  const parts = ['The MCP client `toolFilter` list does not match the server.']
  if (details.missing.length > 0) {
    parts.push(`The server has no tool named ${names(details.missing)}.`)
  }
  if (details.repeated.length > 0) {
    parts.push(`The list repeats ${names(details.repeated)}.`)
  }
  const available =
    details.available.length > 0 ? names(details.available) : '(none)'
  parts.push(`Available tools: ${available}.`)
  return parts.join(' ')
}

/**
 * Thrown by `tools()` when a `toolFilter` list names a tool that the server
 * does not have, or names a tool more than once.
 */
export class MCPToolFilterError extends Error {
  /** Listed, but the server has no tool with this name. */
  readonly missing: Array<string>
  /** Listed more than once. */
  readonly repeated: Array<string>
  /** The server's tool names. */
  readonly available: Array<string>

  constructor(details: ToolFilterDetails) {
    super(toolFilterMessage(details))
    this.name = 'MCPToolFilterError'
    this.missing = details.missing
    this.repeated = details.repeated
    this.available = details.available
  }
}

/**
 * The server did not advertise MCP Events, or it answered method not found.
 *
 * @experimental
 */
export class MCPEventsUnsupportedError extends Error {
  constructor() {
    super('The MCP server does not advertise the Events extension')
    this.name = 'MCPEventsUnsupportedError'
  }
}

/**
 * Invalid MCP Events client options or subscribe arguments.
 *
 * @experimental
 */
export class MCPEventConfigError extends Error {
  constructor(public readonly reason: string) {
    super(reason)
    this.name = 'MCPEventConfigError'
  }
}

/**
 * The event name is missing from `events/list`, or it has no webhook delivery.
 *
 * @experimental
 */
export class MCPUnknownEventError extends Error {
  constructor(
    public readonly eventName: string,
    public readonly reason: 'not-found' | 'webhook-unsupported',
  ) {
    super(
      reason === 'not-found'
        ? `Unknown MCP event "${eventName}"`
        : `MCP event "${eventName}" does not support webhook delivery`,
    )
    this.name = 'MCPUnknownEventError'
  }
}

/**
 * Kind of a JSON-RPC error from an `events/*` request.
 *
 * @experimental
 */
export type MCPEventRequestKind =
  | 'invalid-params'
  | 'not-found'
  | 'forbidden'
  | 'resource-exhausted'
  | 'unsupported'
  | 'callback-endpoint'
  | 'unknown'

/**
 * The server returned a JSON-RPC error for an `events/*` request.
 *
 * @experimental
 */
export class MCPEventRequestError extends Error {
  constructor(
    message: string,
    public readonly code: number,
    public readonly kind: MCPEventRequestKind,
    public readonly reason?: string,
    public readonly data?: unknown,
    public override readonly cause?: unknown,
  ) {
    super(message, cause === undefined ? undefined : { cause })
    this.name = 'MCPEventRequestError'
  }
}

/**
 * `refresh` or `unsubscribe` was given a key or id that is not in the store.
 *
 * @experimental
 */
export class MCPEventSubscriptionNotFoundError extends Error {
  constructor(public readonly ref: { key?: string; id?: string }) {
    super('MCP event subscription was not found')
    this.name = 'MCPEventSubscriptionNotFoundError'
  }
}
