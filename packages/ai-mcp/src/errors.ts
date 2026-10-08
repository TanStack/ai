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
