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
 * Thrown when a task-required tool is explicitly bound via `mcp.tools([...])`
 * but the server does not declare the tasks capability for tools/call, so
 * every invocation would fail. (Auto-discovery silently skips such tools.)
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
        `server exposes no tool with that name. Check the name or run mcp.tools() to list.`,
    )
    this.name = 'MCPToolNotFoundError'
  }
}
