/** Standard Schema that accepts any value. Used by test MCP handlers. */
export const passThroughSchema = {
  '~standard': {
    version: 1 as const,
    vendor: 'tanstack-ai-mcp-test',
    validate(value: unknown) {
      return { value }
    },
  },
}
