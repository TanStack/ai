import { toolDefinition } from '@tanstack/ai'
import { z } from 'zod'

/**
 * Server-side tool definitions (for tools that execute on the server)
 */
export const serverTools = {
  check_status: toolDefinition({
    name: 'check_status',
    description: 'Check system status (no required input)',
    inputSchema: z.object({
      component: z.string().optional(),
    }),
  }).server(async (args) => {
    return JSON.stringify({
      status: 'ok',
      component: args.component || 'all',
      timestamp: Date.now(),
    })
  }),

  get_weather: toolDefinition({
    name: 'get_weather',
    description: 'Get weather for a city',
    inputSchema: z.object({
      city: z.string(),
    }),
  }).server(async (args) => {
    return JSON.stringify({
      city: args.city,
      temperature: 72,
      condition: 'sunny',
    })
  }),

  fetch_data: toolDefinition({
    name: 'fetch_data',
    description: 'Fetch data from a source',
    inputSchema: z.object({
      source: z.string(),
    }),
  }).server(async (args) => {
    return JSON.stringify({
      source: args.source,
      data: [1, 2, 3, 4, 5],
    })
  }),

  get_time: toolDefinition({
    name: 'get_time',
    description: 'Get current time in timezone',
    inputSchema: z.object({
      timezone: z.string(),
    }),
  }).server(async (args) => {
    return JSON.stringify({
      timezone: args.timezone,
      time: '14:30:00',
    })
  }),

  delete_file: toolDefinition({
    name: 'delete_file',
    description: 'Delete a file (requires approval)',
    inputSchema: z.object({
      path: z.string(),
    }),
    needsApproval: true,
  }).server(async (args) => {
    return JSON.stringify({
      deleted: true,
      path: args.path,
    })
  }),
}

/**
 * Client-side tool definitions (tools that execute on the client)
 * These use .client() without an execute function - execution happens on client side
 */
export const clientToolDefinitions = {
  show_notification: toolDefinition({
    name: 'show_notification',
    description: 'Show a notification to the user',
    inputSchema: z.object({
      message: z.string(),
      type: z.enum(['info', 'warning', 'error']),
    }),
  }).client(),

  display_chart: toolDefinition({
    name: 'display_chart',
    description: 'Display a chart on the screen',
    inputSchema: z.object({
      type: z.enum(['bar', 'line', 'pie']),
      data: z.array(z.number()),
    }),
  }).client(),
}

export const searchInventory = toolDefinition({
  name: 'search_inventory',
  description: 'Search the guitar inventory by keyword',
  inputSchema: z.object({
    query: z.string(),
  }),
  lazy: true,
}).server(async (args) => {
  return JSON.stringify({
    query: args.query,
    results: [{ id: 1, name: 'Fender Stratocaster', match: 'name' }],
  })
})

export const failingTool = toolDefinition({
  name: 'failing_tool',
  description: 'A tool that always throws an error',
  inputSchema: z.object({
    message: z.string(),
  }),
}).server(async (args) => {
  throw new Error(`Tool execution failed: ${args.message}`)
})

export const processOrder = toolDefinition({
  name: 'process_order',
  description: 'Process a guitar order with progress updates',
  inputSchema: z.object({
    guitarId: z.number(),
    quantity: z.number(),
  }),
}).server(async (args, context) => {
  context?.emitCustomEvent('order:progress', {
    step: 'validating',
    message: `Validating order for guitar ${args.guitarId}`,
  })

  context?.emitCustomEvent('order:progress', {
    step: 'processing',
    message: `Processing ${args.quantity} items`,
  })

  return JSON.stringify({
    orderId: 'ORD-123',
    guitarId: args.guitarId,
    quantity: args.quantity,
    status: 'completed',
  })
})

// Available test scenarios (UI list with id/label/category)
export const SCENARIO_LIST = [
  { id: 'text-only', label: 'Text Only (No Tools)', category: 'basic' },
  { id: 'server-tool-single', label: 'Single Server Tool', category: 'basic' },
  { id: 'client-tool-single', label: 'Single Client Tool', category: 'basic' },
  { id: 'approval-tool', label: 'Approval Required Tool', category: 'basic' },
  {
    id: 'sequence-server-client',
    label: 'Server \u2192 Client Sequence',
    category: 'basic',
  },
  { id: 'parallel-tools', label: 'Parallel Tools', category: 'basic' },
  {
    id: 'lazy-tool-discovery',
    label: 'Lazy Tool Discovery',
    category: 'basic',
  },
  { id: 'custom-events', label: 'Custom Event Emitting', category: 'basic' },
  { id: 'error', label: 'Error Response', category: 'basic' },
  {
    id: 'tool-error',
    label: 'Tool Throws Error',
    category: 'basic',
  },
  {
    id: 'null-tool-input',
    label: 'Null Tool Input (Regression #265)',
    category: 'basic',
  },
  // Race condition / event flow scenarios
  {
    id: 'sequential-client-tools',
    label: 'Sequential Client Tools (2)',
    category: 'race',
  },
  {
    id: 'parallel-client-tools',
    label: 'Parallel Client Tools',
    category: 'race',
  },
  {
    id: 'sequential-approvals',
    label: 'Sequential Approvals (2)',
    category: 'race',
  },
  { id: 'parallel-approvals', label: 'Parallel Approvals', category: 'race' },
  {
    id: 'client-then-approval',
    label: 'Client \u2192 Approval',
    category: 'race',
  },
  {
    id: 'approval-then-client',
    label: 'Approval \u2192 Client',
    category: 'race',
  },
  {
    id: 'server-then-two-clients',
    label: 'Server \u2192 2 Clients',
    category: 'race',
  },
  {
    id: 'triple-client-sequence',
    label: 'Triple Client Sequence',
    category: 'race',
  },
]

/**
 * Get the tools needed for a specific scenario
 */
export function getToolsForScenario(scenario: string) {
  switch (scenario) {
    case 'text-only':
      return []

    case 'server-tool-single':
      return [serverTools.get_weather]

    case 'client-tool-single':
      return [clientToolDefinitions.show_notification]

    case 'approval-tool':
      return [serverTools.delete_file]

    case 'sequence-server-client':
      return [serverTools.fetch_data, clientToolDefinitions.display_chart]

    case 'parallel-tools':
      return [serverTools.get_weather, serverTools.get_time]

    // Race condition / event flow scenarios
    case 'sequential-client-tools':
      return [clientToolDefinitions.show_notification]

    case 'parallel-client-tools':
      return [
        clientToolDefinitions.show_notification,
        clientToolDefinitions.display_chart,
      ]

    case 'sequential-approvals':
      return [serverTools.delete_file]

    case 'parallel-approvals':
      return [serverTools.delete_file]

    case 'client-then-approval':
      return [clientToolDefinitions.show_notification, serverTools.delete_file]

    case 'approval-then-client':
      return [serverTools.delete_file, clientToolDefinitions.show_notification]

    case 'server-then-two-clients':
      return [
        serverTools.fetch_data,
        clientToolDefinitions.show_notification,
        clientToolDefinitions.display_chart,
      ]

    case 'triple-client-sequence':
      return [
        clientToolDefinitions.show_notification,
        clientToolDefinitions.display_chart,
      ]

    case 'lazy-tool-discovery':
      return [serverTools.get_weather, searchInventory]

    case 'custom-events':
      return [processOrder]

    case 'tool-error':
      return [failingTool]

    case 'null-tool-input':
      return [serverTools.check_status]

    default:
      return []
  }
}
