// Claude AI service for handling queued AI responses
import { anthropicText } from '@tanstack/ai-anthropic'
import { chat, toolDefinition } from '@tanstack/ai'
import type { JSONSchema, ModelMessage, StreamChunk } from '@tanstack/ai'
import type { ClaudeMode } from './chat-api.js'
import type { TodoLogic } from './todo-logic.js'

const listTodosInputSchema: JSONSchema = {
  type: 'object',
  properties: {},
}

const listTodosOutputSchema: JSONSchema = {
  type: 'object',
  properties: {
    todos: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          text: { type: 'string' },
          createdBy: { type: 'string' },
          createdAt: { type: 'string' },
        },
        required: ['id', 'text', 'createdBy', 'createdAt'],
      },
    },
  },
  required: ['todos'],
}

const addTodoInputSchema: JSONSchema = {
  type: 'object',
  properties: {
    text: {
      type: 'string',
      description: 'The todo item text to add',
    },
  },
  required: ['text'],
}

const addTodoOutputSchema: JSONSchema = {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    todo: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        text: { type: 'string' },
        createdBy: { type: 'string' },
        createdAt: { type: 'string' },
      },
      required: ['id', 'text', 'createdBy', 'createdAt'],
    },
    message: { type: 'string' },
  },
  required: ['success', 'todo', 'message'],
}

const removeTodoInputSchema: JSONSchema = {
  type: 'object',
  properties: {
    id: {
      type: 'string',
      description: 'The id of the todo item to remove (from listTodos)',
    },
  },
  required: ['id'],
}

const removeTodoOutputSchema: JSONSchema = {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    message: { type: 'string' },
  },
  required: ['success', 'message'],
}

export const NO_REPLY_TOKEN = 'NO_REPLY'

function createTodoTools(todoLogic: TodoLogic) {
  const listTodosTool = toolDefinition({
    name: 'listTodos',
    description:
      'List all items on the shared group todo list. Use this when asked what todos exist or before removing an item.',
    inputSchema: listTodosInputSchema,
    outputSchema: listTodosOutputSchema,
  }).server(() => {
    const todos = todoLogic.getTodos()
    console.log(`📋 listTodos tool called (${todos.length} items)`)
    return { todos }
  })

  const addTodoTool = toolDefinition({
    name: 'addTodo',
    description: 'Add an item to the shared group todo list.',
    inputSchema: addTodoInputSchema,
    outputSchema: addTodoOutputSchema,
  }).server((rawArgs) => {
    const args = rawArgs as { text: string }
    const todo = todoLogic.addTodo(args.text, 'Claude')
    console.log(`📋 addTodo tool called: ${todo.text}`)
    return {
      success: true,
      todo,
      message: `Added "${todo.text}" to the todo list`,
    }
  })

  const removeTodoTool = toolDefinition({
    name: 'removeTodo',
    description:
      'Remove an item from the shared group todo list by id. Call listTodos first if you do not know the id.',
    inputSchema: removeTodoInputSchema,
    outputSchema: removeTodoOutputSchema,
  }).server((rawArgs) => {
    const args = rawArgs as { id: string }
    const existing = todoLogic.getTodos().find((todo) => todo.id === args.id)
    const success = todoLogic.removeTodo(args.id)
    console.log(`📋 removeTodo tool called: ${args.id} success=${success}`)
    return {
      success,
      message: success
        ? `Removed "${existing?.text ?? args.id}" from the todo list`
        : `No todo found with id ${args.id}`,
    }
  })

  return [listTodosTool, addTodoTool, removeTodoTool]
}

function buildSystemPrompt(mode: ClaudeMode, mentioned: boolean): string {
  const shared = `You are Claude, a friendly AI assistant in a group chat with a shared in-memory todo list.
Keep responses conversational and concise (1-3 sentences unless more detail is needed).
Use the todo tools (listTodos, addTodo, removeTodo) to inspect or change the list — do not invent what is on the list.
When answering questions about the items (including rough estimates like cost), call listTodos first and base your answer on those items.
When removing a todo, call listTodos first if you need the item id.`

  // Explicit @Claude / "Claude, ..." always gets a real reply, even in active mode.
  if (mentioned || mode === 'passive') {
    return `${shared}

Users are talking to you directly. Always reply helpfully — never respond with ${NO_REPLY_TOKEN}.
Help with todo add/remove, questions about the list or its items, and other chat questions they ask you.`
  }

  return `${shared}

You are in ACTIVE mode (watching the chat, not necessarily addressed by name).
Reply and use tools when the message relates to the shared todo list, including:
- adding or removing todos
- listing or summarizing the list
- questions about the items themselves (cost estimates, quantities, planning, substitutions, etc.)
Only when the message has nothing to do with the todo list, respond with exactly: ${NO_REPLY_TOKEN}
Do not use ${NO_REPLY_TOKEN} for questions about items that are on (or being added to) the list.`
}

export interface ClaudeRequest {
  id: string
  username: string
  message: string
  conversationHistory: Array<ModelMessage>
  mode: ClaudeMode
  mentioned: boolean
}

export interface ClaudeQueueStatus {
  current: string | null
  queue: Array<string>
  isProcessing: boolean
  showResponding: boolean
}

function shouldShowResponding(request: ClaudeRequest | null): boolean {
  if (!request) return false
  // Active-mode watches may end in NO_REPLY — don't flash "responding" for those.
  return request.mentioned || request.mode === 'passive'
}

export class ClaudeService {
  private adapter = anthropicText('claude-sonnet-4-5') // Uses ANTHROPIC_API_KEY from env
  private queue: Array<ClaudeRequest> = []
  private currentRequest: ClaudeRequest | null = null
  private isProcessing = false
  private todoTools: ReturnType<typeof createTodoTools>

  constructor(todoLogic: TodoLogic) {
    this.todoTools = createTodoTools(todoLogic)
  }

  enqueue(request: ClaudeRequest): void {
    console.log(
      `🤖 Claude: Enqueuing request from ${request.username} (mode=${request.mode}, mentioned=${request.mentioned})`,
    )
    this.queue.push(request)
  }

  getQueueStatus(): ClaudeQueueStatus {
    return {
      current: this.currentRequest?.username || null,
      queue: this.queue.map((r) => r.username),
      isProcessing: this.isProcessing,
      showResponding:
        this.isProcessing && shouldShowResponding(this.currentRequest),
    }
  }

  getCurrentRequest(): ClaudeRequest | null {
    return this.currentRequest
  }

  startProcessing(): void {
    if (this.isProcessing || this.queue.length === 0) return

    this.isProcessing = true
    this.currentRequest = this.queue.shift()!
    console.log(
      `🤖 Claude: Started processing request from ${this.currentRequest.username}`,
    )
  }

  finishProcessing(): void {
    console.log(
      `🤖 Claude: Finished processing request from ${this.currentRequest?.username}`,
    )
    this.currentRequest = null
    this.isProcessing = false
  }

  async *streamResponse(
    conversationHistory: Array<ModelMessage>,
    mode: ClaudeMode,
    mentioned: boolean,
  ): AsyncIterable<StreamChunk> {
    const systemMessage = buildSystemPrompt(mode, mentioned)

    try {
      console.log(`🤖 Claude: ========== STARTING STREAM RESPONSE ==========`)
      console.log(`🤖 Claude: Mode: ${mode}, mentioned: ${mentioned}`)
      console.log(
        `🤖 Claude: Conversation history (${conversationHistory.length} messages):`,
      )
      conversationHistory.forEach((m, i) => {
        const content =
          typeof m.content === 'string' ? m.content.substring(0, 80) : '[array]'
        console.log(`  ${i + 1}. ${m.role}: ${content}...`)
      })

      let chunkCount = 0
      let accumulatedContent = ''

      for await (const chunk of chat({
        adapter: this.adapter,
        systemPrompts: [systemMessage],
        messages: [...conversationHistory] as any,
        tools: this.todoTools,
      })) {
        chunkCount++

        if (chunk.type === 'TEXT_MESSAGE_CONTENT' && chunk.delta) {
          accumulatedContent += chunk.delta
          console.log(
            `🤖 Claude: Chunk #${chunkCount} [content] delta: "${chunk.delta}" (total: ${accumulatedContent.length} chars)`,
          )
        } else {
          console.log(
            `🤖 Claude: Chunk #${chunkCount} [${chunk.type}]`,
            JSON.stringify(chunk, null, 2).substring(0, 200),
          )
        }

        yield chunk
      }

      console.log(`🤖 Claude: ========== STREAM COMPLETE ==========`)
      console.log(
        `🤖 Claude: Total chunks: ${chunkCount}, Final content: "${accumulatedContent}"`,
      )
    } catch (error) {
      console.error('🤖 Claude: ========== ERROR IN STREAM ==========')
      console.error('🤖 Claude: Error streaming response:', error)
      throw error
    }
  }
}
