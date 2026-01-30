import { createFileRoute } from '@tanstack/react-router'
import {
  chat,
  maxIterations,
  toServerSentEventsResponse,
  toolDefinition,
} from '@tanstack/ai'
import { z } from 'zod'
import {
  createLLMSimulator,
  type SimulatorScript,
} from '@tanstack/tests-adapters'

/**
 * Pre-defined test scenarios for tool testing
 */
const SCENARIOS: Record<string, SimulatorScript> = {
  // Simple text response (no tools)
  'text-only': {
    iterations: [
      {
        content: 'This is a simple text response without any tools.',
      },
    ],
  },

  // Single server tool
  'server-tool-single': {
    iterations: [
      {
        content: 'Let me get the weather for you.',
        toolCalls: [
          { name: 'get_weather', arguments: { city: 'San Francisco' } },
        ],
      },
      {
        content: 'The weather in San Francisco is 72°F and sunny.',
      },
    ],
  },

  // Single client tool
  'client-tool-single': {
    iterations: [
      {
        content: 'I need to show you a notification.',
        toolCalls: [
          {
            name: 'show_notification',
            arguments: { message: 'Hello from the AI!', type: 'info' },
          },
        ],
      },
      {
        content: 'The notification has been shown.',
      },
    ],
  },

  // Approval tool
  'approval-tool': {
    iterations: [
      {
        content: 'I need your permission to delete this file.',
        toolCalls: [
          {
            name: 'delete_file',
            arguments: { path: '/tmp/test.txt' },
          },
        ],
      },
      {
        content: 'The file has been deleted.',
      },
    ],
  },

  // Server tool -> Client tool sequence
  'sequence-server-client': {
    iterations: [
      {
        content: 'First, let me fetch the data.',
        toolCalls: [{ name: 'fetch_data', arguments: { source: 'api' } }],
      },
      {
        content: 'Now let me display it on screen.',
        toolCalls: [
          {
            name: 'display_chart',
            arguments: { type: 'bar', data: [1, 2, 3] },
          },
        ],
      },
      {
        content: 'The chart is now displayed.',
      },
    ],
  },

  // Multiple tools in parallel
  'parallel-tools': {
    iterations: [
      {
        content: 'Let me gather all the information at once.',
        toolCalls: [
          { name: 'get_weather', arguments: { city: 'NYC' } },
          { name: 'get_time', arguments: { timezone: 'EST' } },
        ],
      },
      {
        content: 'Here is the weather and time for NYC.',
      },
    ],
  },

  // =========================================================================
  // RACE CONDITION / EVENT FLOW SCENARIOS
  // These test the client-side event handling and continuation logic
  // =========================================================================

  // Two client tools in sequence - tests continuation after first client tool completes
  'sequential-client-tools': {
    iterations: [
      {
        content: 'First notification coming.',
        toolCalls: [
          {
            name: 'show_notification',
            arguments: { message: 'First notification', type: 'info' },
          },
        ],
      },
      {
        content: 'Second notification coming.',
        toolCalls: [
          {
            name: 'show_notification',
            arguments: { message: 'Second notification', type: 'warning' },
          },
        ],
      },
      {
        content: 'Both notifications have been shown.',
      },
    ],
  },

  // Multiple client tools in parallel (same turn) - tests handling of concurrent client executions
  'parallel-client-tools': {
    iterations: [
      {
        content: 'Showing multiple things at once.',
        toolCalls: [
          {
            name: 'show_notification',
            arguments: { message: 'Parallel 1', type: 'info' },
          },
          {
            name: 'display_chart',
            arguments: { type: 'bar', data: [1, 2, 3] },
          },
        ],
      },
      {
        content: 'All displayed.',
      },
    ],
  },

  // Two approvals in sequence - tests approval flow continuation
  'sequential-approvals': {
    iterations: [
      {
        content: 'First I need to delete file A.',
        toolCalls: [
          {
            name: 'delete_file',
            arguments: { path: '/tmp/a.txt' },
          },
        ],
      },
      {
        content: 'Now I need to delete file B.',
        toolCalls: [
          {
            name: 'delete_file',
            arguments: { path: '/tmp/b.txt' },
          },
        ],
      },
      {
        content: 'Both files have been processed.',
      },
    ],
  },

  // Multiple approvals in parallel (same turn) - tests handling of concurrent approvals
  'parallel-approvals': {
    iterations: [
      {
        content: 'I need to delete multiple files at once.',
        toolCalls: [
          {
            name: 'delete_file',
            arguments: { path: '/tmp/parallel-a.txt' },
          },
          {
            name: 'delete_file',
            arguments: { path: '/tmp/parallel-b.txt' },
          },
        ],
      },
      {
        content: 'All files have been processed.',
      },
    ],
  },

  // Client tool followed by approval - tests mixed flow
  'client-then-approval': {
    iterations: [
      {
        content: 'First a notification.',
        toolCalls: [
          {
            name: 'show_notification',
            arguments: { message: 'Before approval', type: 'info' },
          },
        ],
      },
      {
        content: 'Now I need approval to delete.',
        toolCalls: [
          {
            name: 'delete_file',
            arguments: { path: '/tmp/after-notify.txt' },
          },
        ],
      },
      {
        content: 'Complete.',
      },
    ],
  },

  // Approval followed by client tool - tests that approval doesn't block subsequent client tools
  'approval-then-client': {
    iterations: [
      {
        content: 'First I need approval.',
        toolCalls: [
          {
            name: 'delete_file',
            arguments: { path: '/tmp/before-notify.txt' },
          },
        ],
      },
      {
        content: 'Now showing notification.',
        toolCalls: [
          {
            name: 'show_notification',
            arguments: { message: 'After approval', type: 'info' },
          },
        ],
      },
      {
        content: 'Complete.',
      },
    ],
  },

  // Server tool followed by two client tools - tests complex continuation
  'server-then-two-clients': {
    iterations: [
      {
        content: 'Fetching data first.',
        toolCalls: [{ name: 'fetch_data', arguments: { source: 'db' } }],
      },
      {
        content: 'First client action.',
        toolCalls: [
          {
            name: 'show_notification',
            arguments: { message: 'Data fetched', type: 'info' },
          },
        ],
      },
      {
        content: 'Second client action.',
        toolCalls: [
          {
            name: 'display_chart',
            arguments: { type: 'line', data: [10, 20, 30] },
          },
        ],
      },
      {
        content: 'All done.',
      },
    ],
  },

  // Three client tools in sequence - stress test continuation logic
  'triple-client-sequence': {
    iterations: [
      {
        content: 'First step.',
        toolCalls: [
          {
            name: 'show_notification',
            arguments: { message: 'Step 1', type: 'info' },
          },
        ],
      },
      {
        content: 'Second step.',
        toolCalls: [
          {
            name: 'display_chart',
            arguments: { type: 'pie', data: [25, 25, 50] },
          },
        ],
      },
      {
        content: 'Third step.',
        toolCalls: [
          {
            name: 'show_notification',
            arguments: { message: 'Step 3', type: 'warning' },
          },
        ],
      },
      {
        content: 'All three steps complete.',
      },
    ],
  },
}

/**
 * Server-side tool definitions (for tools that execute on the server)
 */
const serverTools = {
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
const clientToolDefinitions = {
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

export const Route = createFileRoute('/api/tools-test')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const requestSignal = request.signal

        if (requestSignal?.aborted) {
          return new Response(null, { status: 499 })
        }

        const abortController = new AbortController()

        try {
          const body = await request.json()
          // scenario is in body.data (from useChat body option) or body directly (legacy)
          const messages = body.messages
          const scenario = body.data?.scenario || body.scenario || 'text-only'

          // Get the script for this scenario
          const script = SCENARIOS[scenario]
          if (!script) {
            return new Response(
              JSON.stringify({
                error: `Unknown scenario: ${scenario}. Available: ${Object.keys(SCENARIOS).join(', ')}`,
              }),
              {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
              },
            )
          }

          // Create simulator with the script
          const adapter = createLLMSimulator(script)

          // Determine which tools to include based on the scenario
          const tools = getToolsForScenario(scenario)

          const stream = chat({
            adapter,
            model: 'simulator-model',
            messages,
            tools,
            agentLoopStrategy: maxIterations(20),
            abortController,
          })

          return toServerSentEventsResponse(stream, { abortController })
        } catch (error: any) {
          console.error('[Tools Test API] Error:', error)
          if (error.name === 'AbortError' || abortController.signal.aborted) {
            return new Response(null, { status: 499 })
          }
          return new Response(
            JSON.stringify({
              error: error.message || 'An error occurred',
            }),
            {
              status: 500,
              headers: { 'Content-Type': 'application/json' },
            },
          )
        }
      },
    },
  },
})

/**
 * Get the tools needed for a specific scenario
 */
function getToolsForScenario(scenario: string) {
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

    default:
      return []
  }
}
