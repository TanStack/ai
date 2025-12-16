import { toolDefinition } from '@tanstack/ai'
import { z } from 'zod'

// Common schema for all simulator tools
const simulatorInputSchema = z.object({
  text: z
    .string()
    .optional()
    .describe('Optional text to include in the result'),
  delay: z
    .number()
    .optional()
    .describe('Delay in seconds before returning the result'),
})

const simulatorOutputSchema = z.object({
  toolName: z.string(),
  text: z.string().optional(),
  delayApplied: z.number().optional(),
  executedOn: z.enum(['server', 'client']),
  timestamp: z.number(),
})

// Helper to create a delayed result
const createResult = async (
  toolName: string,
  executedOn: 'server' | 'client',
  args: { text?: string; delay?: number },
) => {
  const delayMs = args.delay
  if (delayMs && delayMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, delayMs * 1000))
  }
  return {
    toolName,
    text: args.text,
    delayApplied: args.delay,
    executedOn,
    timestamp: Date.now(),
  }
}

// ============================================================================
// 1. Server Tool (executed only on server)
// ============================================================================
export const serverToolDef = toolDefinition({
  name: 'serverTool',
  description:
    'A server-side only tool. Execution happens on the server and result is streamed back.',
  inputSchema: simulatorInputSchema,
  outputSchema: simulatorOutputSchema,
})

export const serverTool = serverToolDef.server((args) =>
  createResult('serverTool', 'server', args),
)

// ============================================================================
// 2. Server Tool with Approval (requires user approval, executed on server)
// ============================================================================
export const serverToolWithApprovalDef = toolDefinition({
  name: 'serverToolWithApproval',
  description:
    'A server-side tool that requires user approval before execution.',
  inputSchema: simulatorInputSchema,
  outputSchema: simulatorOutputSchema,
  needsApproval: true,
})

export const serverToolWithApproval = serverToolWithApprovalDef.server((args) =>
  createResult('serverToolWithApproval', 'server', args),
)

// ============================================================================
// 3. Client Tool (executed only on client)
// ============================================================================
export const clientToolDef = toolDefinition({
  name: 'clientTool',
  description:
    'A client-side only tool. Execution happens in the browser and result is sent back.',
  inputSchema: simulatorInputSchema,
  outputSchema: simulatorOutputSchema,
})

// Client implementation is provided by the consumer via .client()

// ============================================================================
// 4. Client Tool with Approval (requires user approval, executed on client)
// ============================================================================
export const clientToolWithApprovalDef = toolDefinition({
  name: 'clientToolWithApproval',
  description:
    'A client-side tool that requires user approval before execution.',
  inputSchema: simulatorInputSchema,
  outputSchema: simulatorOutputSchema,
  needsApproval: true,
})

// Client implementation is provided by the consumer via .client()

// ============================================================================
// 5. Client/Server Tool (has both server and client implementations)
// ============================================================================
export const clientServerToolDef = toolDefinition({
  name: 'clientServerTool',
  description:
    'A hybrid tool with both server and client implementations. Client takes precedence.',
  inputSchema: simulatorInputSchema,
  outputSchema: simulatorOutputSchema,
})

export const clientServerTool = clientServerToolDef.server((args) =>
  createResult('clientServerTool', 'server', args),
)

// Client implementation is provided by the consumer via .client()

// ============================================================================
// 6. Client/Server Tool with Approval (requires approval, has both implementations)
// ============================================================================
export const clientServerToolWithApprovalDef = toolDefinition({
  name: 'clientServerToolWithApproval',
  description:
    'A hybrid tool with both server and client implementations that requires approval.',
  inputSchema: simulatorInputSchema,
  outputSchema: simulatorOutputSchema,
  needsApproval: true,
})

export const clientServerToolWithApproval =
  clientServerToolWithApprovalDef.server((args) =>
    createResult('clientServerToolWithApproval', 'server', args),
  )

// Client implementation is provided by the consumer via .client()

// ============================================================================
// Exports for convenience
// ============================================================================

// All tool definitions (for client-side registration)
export const allToolDefs = [
  serverToolDef,
  serverToolWithApprovalDef,
  clientToolDef,
  clientToolWithApprovalDef,
  clientServerToolDef,
  clientServerToolWithApprovalDef,
] as const

// Server tools with implementations (for server API)
export const serverTools = [
  serverTool,
  serverToolWithApproval,
  clientServerTool,
  clientServerToolWithApproval,
]

// Helper to create client tool result
export const createClientResult = (
  toolName: string,
  args: { text?: string; delay?: number },
) => createResult(toolName, 'client', args)
