import { toolDefinition } from '@tanstack/ai'
import { defineCommand } from '../commands'
import { definePlugin } from '../plugins'

export interface Todo {
  text: string
  status: 'pending' | 'in_progress' | 'done'
}

function isTodo(value: unknown): value is Todo {
  return (
    typeof value === 'object' &&
    value !== null &&
    'text' in value &&
    typeof value.text === 'string' &&
    'status' in value &&
    (value.status === 'pending' ||
      value.status === 'in_progress' ||
      value.status === 'done')
  )
}

const MARK = { pending: '[ ]', in_progress: '[~]', done: '[x]' } as const

export function formatTodos(items: ReadonlyArray<Todo>): string {
  return items.map((item) => `${MARK[item.status]} ${item.text}`).join('\n')
}

/**
 * A todo list the model keeps for multi-step work (like Claude Code's
 * TodoWrite). The list is plugin state, so clients see it change and it
 * survives restarts. `/todos` shows it.
 */
export function todos() {
  return definePlugin({
    name: 'tanstack/todos',
    setup: async (ctx) => {
      const state = ctx.state<{ items: Array<Todo> }>({ items: [] })
      // The prompt runs for each turn, so keep a copy of the list at hand.
      let current = (await state.get()).items
      return {
        tools: [
          toolDefinition({
            name: 'todo_write',
            description:
              'Replace the todo list. Use it for work with several steps. Mark one item in_progress at a time.',
            inputSchema: {
              type: 'object',
              properties: {
                todos: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      text: { type: 'string' },
                      status: {
                        type: 'string',
                        enum: ['pending', 'in_progress', 'done'],
                      },
                    },
                    required: ['text', 'status'],
                  },
                },
              },
              required: ['todos'],
            },
            replay: 'safe',
          }).server(async (args: unknown) => {
            const list =
              typeof args === 'object' &&
              args !== null &&
              'todos' in args &&
              Array.isArray(args.todos)
                ? args.todos
                : []
            if (!list.every(isTodo))
              throw new Error('Each todo needs text and a status.')
            current = (await state.update(() => ({ items: list }))).items
            return formatTodos(current) || 'The todo list is empty.'
          }),
        ],
        prompts: [
          {
            id: 'tanstack/todos:list',
            text: () =>
              current.length > 0
                ? `Current todo list:\n${formatTodos(current)}`
                : '',
          },
        ],
        commands: {
          todos: defineCommand({
            description: 'Show the todo list',
            run: () => formatTodos(current) || 'The todo list is empty.',
          }),
        },
      }
    },
  })
}
