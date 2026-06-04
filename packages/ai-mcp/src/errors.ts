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

export class MCPToolNotFoundError extends Error {
  constructor(public readonly toolName: string) {
    super(
      `toolDefinition name "${toolName}" was passed to mcp.tools([...]) but the MCP ` +
        `server exposes no tool with that name. Check the name or run mcp.tools() to list.`,
    )
    this.name = 'MCPToolNotFoundError'
  }
}
