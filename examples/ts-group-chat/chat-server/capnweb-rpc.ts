// Cap'n Web RPC server implementation for chat
import { RpcTarget } from 'capnweb'
import { ChatLogic } from './chat-logic.js'
import { TodoLogic } from './todo-logic.js'
import type {
  ChatApi,
  ChatNotification,
  ChatNotifierApi,
  ClaudeMode,
  ClaudeQueueStatus,
  JoinResult,
  SendResult,
  TodoItem,
} from './chat-api.js'
import type { ClaudeService } from './claude-service.js'
import type { WebSocket } from 'ws'

type NotifyTarget = ChatNotifierApi

// Global registry of client notification targets (Cap'n Web RpcTarget stubs)
export const clients = new Map<string, NotifyTarget>()

let claudeMode: ClaudeMode = 'passive'

// Lazy-load claude service to avoid importing AI packages at module parse time
let globalClaudeService: ClaudeService | null = null
async function getClaudeService(): Promise<ClaudeService> {
  if (!globalClaudeService) {
    const { ClaudeService } = await import('./claude-service.js')
    globalClaudeService = new ClaudeService(globalTodos)
  }
  return globalClaudeService
}

function pushNotification(
  notifier: ChatNotifierApi,
  notification: ChatNotification,
) {
  // Defer server→client RPC so we never nest calls inside an in-flight handler
  // (Cap'n Web 0.10 throws "' is not a function" in the browser otherwise).
  queueMicrotask(() => {
    void Promise.resolve(notifier.notify(notification)).catch((error) => {
      console.error('Failed to push notification to client:', error)
    })
  })
}

function normalizeNotification(
  notification: ChatNotification,
): ChatNotification {
  return {
    ...notification,
    timestamp: notification.timestamp || new Date().toISOString(),
    id: notification.id || Math.random().toString(36).slice(2, 11),
  }
}

function isClaudeMention(messageText: string): boolean {
  const trimmedMessage = messageText.trim()
  return (
    /@Claude/i.test(messageText) ||
    /^Claude/i.test(trimmedMessage) ||
    /^@Claude/i.test(trimmedMessage)
  )
}

function isNoReply(response: string): boolean {
  return response.trim().toUpperCase() === 'NO_REPLY'
}

// Global shared todo list
export const globalTodos = new TodoLogic({
  async onTodosChanged(todos) {
    await ChatServer.broadcastToAll({
      type: 'todos_updated',
      message: 'Todo list updated',
      username: 'System',
      todos,
    })
  },
})

// Global shared chat instance
export const globalChat = new ChatLogic({
  async onUserJoined(username) {
    await ChatServer.broadcastToAll({
      type: 'user_joined',
      message: `${username} joined the chat`,
      username,
      onlineUsers: globalChat.getOnlineUsers(),
    })
  },

  async onUserLeft(username) {
    await ChatServer.broadcastToAll(
      {
        type: 'user_left',
        message: `${username} left the chat`,
        username,
        onlineUsers: globalChat.getOnlineUsers(),
      },
      username,
    )
  },

  async onMessageSent(message) {
    await ChatServer.broadcastToAll({
      type: 'message',
      message: message.message,
      username: message.username,
      timestamp: message.timestamp,
      id: message.id,
    })
  },
})

// Global registry of active RPC server instances
export const activeServers = new Set<ChatServer>()

// Chat Server Implementation (one per connection)
export class ChatServer extends RpcTarget implements ChatApi {
  public currentUsername: string | null = null
  private clientNotifier: ChatNotifierApi | null = null

  constructor() {
    super()
    activeServers.add(this)
    console.log(`📡 Registered new chat server. Total: ${activeServers.size}`)
  }

  setClientNotifier(notifier: ChatNotifierApi) {
    this.clientNotifier = notifier
  }

  setWebSocket(ws: WebSocket) {
    ws.on('close', () => {
      if (this.currentUsername) {
        this.leaveChat()
        console.log(`🔌 WebSocket disconnected for ${this.currentUsername}`)
      }
      this.dispose()
    })
  }

  static broadcastToAll(notification: ChatNotification, excludeUser?: string) {
    const payload = normalizeNotification(notification)
    const msgPreview = payload.message.substring(0, 50)
    console.log(
      `\n📬 broadcastToAll() - type: ${payload.type}, from: ${payload.username}, message: "${msgPreview}..."`,
    )
    console.log(`📬 Connected users: ${Array.from(clients.keys()).join(', ')}`)
    console.log(`📬 Exclude user: ${excludeUser || 'none'}`)

    let successCount = 0
    const successful: Array<string> = []

    for (const [username, callback] of clients.entries()) {
      if (excludeUser && username === excludeUser) {
        console.log(`📬 Skipping excluded user: ${username}`)
        continue
      }

      try {
        pushNotification(callback, payload)
        successCount++
        successful.push(username)
        console.log(`📬 Queued push to ${username}`)
      } catch (error) {
        console.error(`📬 Failed to notify ${username}:`, error)
      }
    }

    console.log(
      `📬 Broadcast complete: ${successCount} users notified (${successful.join(
        ', ',
      )})\n`,
    )
    return { successful, successCount }
  }

  dispose() {
    activeServers.delete(this)
    if (this.currentUsername) {
      clients.delete(this.currentUsername)
    }
    console.log(`📡 Unregistered chat server. Total: ${activeServers.size}`)
  }

  joinChat(username: string): JoinResult {
    console.log(`${username} is joining the chat`)

    if (!this.clientNotifier) {
      throw new Error('Client notifier not available on this connection')
    }

    const trimmed = username.trim()
    if (!trimmed) {
      throw new Error('Username cannot be empty')
    }

    // Same connection switching personas: leave the previous identity first
    // so it is not left registered in `clients` (which double-delivers pushes).
    if (this.currentUsername && this.currentUsername !== trimmed) {
      console.log(
        `🔄 Switching identity on connection: ${this.currentUsername} → ${trimmed}`,
      )
      this.leaveChat()
    }

    if (this.currentUsername === trimmed) {
      return {
        message: 'Already joined the chat',
        onlineUsers: globalChat.getOnlineUsers(),
        recentMessages: globalChat.getMessages().slice(-20),
        todos: globalTodos.getTodos(),
        claudeMode,
      }
    }

    this.currentUsername = trimmed
    clients.set(trimmed, this.clientNotifier)

    globalChat.addUserSync(trimmed)

    const welcomeMessage = normalizeNotification({
      type: 'welcome',
      message: `Welcome to the chat, ${trimmed}! 👋`,
      username: 'System',
    })

    pushNotification(this.clientNotifier, welcomeMessage)

    return {
      message: 'Successfully joined the chat',
      onlineUsers: globalChat.getOnlineUsers(),
      recentMessages: globalChat.getMessages().slice(-20),
      todos: globalTodos.getTodos(),
      claudeMode,
    }
  }

  leaveChat() {
    if (!this.currentUsername) {
      return { message: 'Not in chat' }
    }

    const username = this.currentUsername
    console.log(`${username} is leaving the chat`)
    globalChat.removeUserSync(username)
    clients.delete(username)
    this.currentUsername = null

    return {
      message: 'Successfully left the chat',
    }
  }

  getChatState() {
    return {
      ...globalChat.getChatState(),
      todos: globalTodos.getTodos(),
      claudeMode,
    }
  }

  getTodos(): Array<TodoItem> {
    return globalTodos.getTodos()
  }

  addTodo(text: string) {
    if (!this.currentUsername) {
      throw new Error('You must join the chat first')
    }

    const todo = globalTodos.addTodo(text, this.currentUsername)
    return {
      todo,
      todos: globalTodos.getTodos(),
    }
  }

  removeTodo(id: string) {
    if (!this.currentUsername) {
      throw new Error('You must join the chat first')
    }

    const success = globalTodos.removeTodo(id)
    return {
      success,
      todos: globalTodos.getTodos(),
    }
  }

  getClaudeMode(): ClaudeMode {
    return claudeMode
  }

  setClaudeMode(mode: ClaudeMode) {
    claudeMode = mode
    console.log(`🤖 Claude mode set to ${mode}`)

    void ChatServer.broadcastToAll({
      type: 'claude_mode_changed',
      message: `Claude is now in ${mode} mode`,
      username: 'System',
      claudeMode: mode,
    })

    return { mode: claudeMode }
  }

  sendMessage(messageText: string): SendResult {
    console.log(
      `\n📨 [${this.currentUsername}] sendMessage called: "${messageText}"`,
    )

    if (!this.currentUsername) {
      throw new Error('You must join the chat first')
    }

    if (!messageText.trim()) {
      throw new Error('Message cannot be empty')
    }

    const trimmedMessage = messageText.trim()
    const mentioned = isClaudeMention(trimmedMessage)
    const shouldAskClaude =
      mentioned ||
      (claudeMode === 'active' && this.currentUsername !== 'Claude')

    const message = globalChat.sendMessageSync(
      this.currentUsername,
      trimmedMessage,
    )

    if (shouldAskClaude) {
      void this.enqueueClaudeRequest(trimmedMessage, mentioned)
      return {
        message: mentioned
          ? 'Claude request queued'
          : 'Message sent; Claude is watching in active mode',
        chatMessage: message,
      }
    }

    return {
      message: 'Message sent successfully',
      chatMessage: message,
    }
  }

  private async enqueueClaudeRequest(messageText: string, mentioned: boolean) {
    const conversationHistory = globalChat.getMessages().map((msg) => ({
      role: 'user' as const,
      content: `${msg.username}: ${msg.message}`,
    }))

    const claudeService = await getClaudeService()
    claudeService.enqueue({
      id: Math.random().toString(36).slice(2, 11),
      username: this.currentUsername!,
      message: messageText,
      conversationHistory,
      mode: claudeMode,
      mentioned,
    })

    void this.processClaudeQueue()
  }

  private async processClaudeQueue() {
    const claudeService = await getClaudeService()
    const status = claudeService.getQueueStatus()

    if (status.isProcessing || status.queue.length === 0) {
      return
    }

    claudeService.startProcessing()
    const currentRequest = claudeService.getCurrentRequest()
    const requestMode = currentRequest?.mode ?? claudeMode
    const mentioned = currentRequest?.mentioned ?? false
    const showResponding = claudeService.getQueueStatus().showResponding

    try {
      // Only announce when a visible reply is expected (not active silent watches).
      if (showResponding) {
        await ChatServer.broadcastToAll({
          type: 'claude_responding',
          message: 'Claude is responding',
          username: currentRequest?.username ?? 'System',
        })
      }

      const conversationHistory = globalChat.getMessages().map((msg) => ({
        role: 'user' as const,
        content: `${msg.username}: ${msg.message}`,
      }))

      let accumulatedResponse = ''
      for await (const chunk of claudeService.streamResponse(
        conversationHistory,
        requestMode,
        mentioned,
      )) {
        if (chunk.type === 'TEXT_MESSAGE_CONTENT' && chunk.delta) {
          accumulatedResponse += chunk.delta
        }
      }

      if (!isNoReply(accumulatedResponse) && accumulatedResponse.trim()) {
        await globalChat.sendMessage('Claude', accumulatedResponse.trim())
      } else {
        console.log('🤖 Claude: Skipping empty / NO_REPLY response')
      }
    } catch (error) {
      console.error('Error in processClaudeQueue:', error)

      await ChatServer.broadcastToAll({
        type: 'claude_error',
        message: 'Claude encountered an error responding',
        username: 'System',
      })
    } finally {
      claudeService.finishProcessing()
      // Clear any "responding" UI state (not shown as a chat line).
      await ChatServer.broadcastToAll({
        type: 'claude_idle',
        message: 'Claude finished',
        username: 'System',
      })
      void this.processClaudeQueue()
    }
  }

  getClaudeQueueStatus(): ClaudeQueueStatus {
    if (!globalClaudeService) {
      return {
        current: null,
        queue: [],
        isProcessing: false,
        showResponding: false,
      }
    }

    return globalClaudeService.getQueueStatus()
  }
}
