import { type SimulatorScript } from '@tanstack/tests-adapters'

/**
 * Pre-defined test scenarios for tool testing
 */
export const SCENARIOS: Record<string, SimulatorScript> = {
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

  // Lazy tool discovery scenario
  'lazy-tool-discovery': {
    iterations: [
      {
        toolCalls: [
          { name: '__lazy__tool__discovery__', arguments: { toolNames: ['search_inventory'] } },
        ],
      },
      {
        toolCalls: [
          { name: 'search_inventory', arguments: { query: 'stratocaster' } },
        ],
      },
      {
        content: 'I found a Fender Stratocaster in the inventory.',
      },
    ],
  },

  // Custom event emitting scenario
  'custom-events': {
    iterations: [
      {
        toolCalls: [
          { name: 'process_order', arguments: { guitarId: 1, quantity: 2 } },
        ],
      },
      {
        content: 'Your order has been processed successfully.',
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

// Available test scenarios (UI list with id/label/category)
export const SCENARIO_LIST = [
  { id: 'text-only', label: 'Text Only (No Tools)', category: 'basic' },
  { id: 'server-tool-single', label: 'Single Server Tool', category: 'basic' },
  { id: 'client-tool-single', label: 'Single Client Tool', category: 'basic' },
  { id: 'approval-tool', label: 'Approval Required Tool', category: 'basic' },
  {
    id: 'sequence-server-client',
    label: 'Server → Client Sequence',
    category: 'basic',
  },
  { id: 'parallel-tools', label: 'Parallel Tools', category: 'basic' },
  { id: 'lazy-tool-discovery', label: 'Lazy Tool Discovery', category: 'basic' },
  { id: 'custom-events', label: 'Custom Event Emitting', category: 'basic' },
  { id: 'error', label: 'Error Response', category: 'basic' },
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
  { id: 'client-then-approval', label: 'Client → Approval', category: 'race' },
  { id: 'approval-then-client', label: 'Approval → Client', category: 'race' },
  {
    id: 'server-then-two-clients',
    label: 'Server → 2 Clients',
    category: 'race',
  },
  {
    id: 'triple-client-sequence',
    label: 'Triple Client Sequence',
    category: 'race',
  },
]
