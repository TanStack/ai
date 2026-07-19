// Cap'n Web RPC server implementation for chat
import { RpcTarget } from 'capnweb'
import { ChatLogic } from './chat-logic.js'
import type {
  ChatApi,
  ChatNotification,
  ChatNotifierApi,
  ClaudeQueueStatus,
  JoinResult,
  SendResult,
} from './chat-api.js'
import type { ClaudeService } from './claude-service.js'
import type { WebSocket } from 'ws'

type NotifyTarget = ChatNotifierApi

// Global registry of client notification targets (Cap'n Web RpcTarget stubs)
export const clients = new Map<string, NotifyTarget>()

// Lazy-load claude service to avoid importing AI packages at module parse time
let globalClaudeService: ClaudeService | null = null
async function getClaudeService(): Promise<ClaudeService> {
  if (!globalClaudeService) {
    const { globalClaudeService: service } = await import('./claude-service.js')
    globalClaudeService = service
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

  static async broadcastToAll(
    notification: ChatNotification,
    excludeUser?: string,
  ) {
    const payload = normalizeNotification(notification)
    const msgPreview = payload.message?.substring(0, 50) || ''
    console.log(
      `\n📬 broadcastToAll() - type: ${payload.type}, from: ${payload.username}, message: "${msgPreview}..."`,
    )
    console.log(`📬 Connected users: ${Array.from(clients.keys()).join(', ')}`)
    console.log(`📬 Exclude user: ${excludeUser || 'none'}`)

    let successCount = 0
    const successful: string[] = []

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

    this.currentUsername = username
    clients.set(username, this.clientNotifier)

    globalChat.addUserSync(username)

    const welcomeMessage = normalizeNotification({
      type: 'welcome',
      message: `Welcome to the chat, ${username}! 👋`,
      username: 'System',
    })

    pushNotification(this.clientNotifier, welcomeMessage)

    return {
      message: 'Successfully joined the chat',
      onlineUsers: globalChat.getOnlineUsers(),
      recentMessages: globalChat.getMessages().slice(-20),
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
    return globalChat.getChatState()
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
    const isClaudeMention =
      /@Claude/i.test(messageText) ||
      /^Claude/i.test(trimmedMessage) ||
      /^@Claude/i.test(trimmedMessage)

    if (isClaudeMention) {
      const message = globalChat.sendMessageSync(
        this.currentUsername,
        messageText.trim(),
      )

      void this.enqueueClaudeRequest(messageText)

      return {
        message: 'Claude request queued',
        chatMessage: message,
      }
    }

    const message = globalChat.sendMessageSync(
      this.currentUsername,
      messageText.trim(),
    )

    return {
      message: 'Message sent successfully',
      chatMessage: message,
    }
  }

  private async enqueueClaudeRequest(messageText: string) {
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

    try {
      const currentStatus = claudeService.getQueueStatus()

      await ChatServer.broadcastToAll({
        type: 'claude_responding',
        message: `Claude is responding to ${currentStatus.current}...`,
        username: 'System',
      })

      const conversationHistory = globalChat.getMessages().map((msg) => ({
        role: 'user' as const,
        content: `${msg.username}: ${msg.message}`,
      }))

      let accumulatedResponse = ''
      for await (const chunk of claudeService.streamResponse(
        conversationHistory,
      )) {
        if (chunk.type === 'TEXT_MESSAGE_CONTENT' && chunk.delta) {
          accumulatedResponse += chunk.delta
        }
      }

      await globalChat.sendMessage('Claude', accumulatedResponse)
    } catch (error) {
      console.error('Error in processClaudeQueue:', error)

      await ChatServer.broadcastToAll({
        type: 'claude_error',
        message: 'Claude encountered an error responding',
        username: 'System',
      })
    } finally {
      claudeService.finishProcessing()
      void this.processClaudeQueue()
    }
  }

  getClaudeQueueStatus(): ClaudeQueueStatus {
    if (!globalClaudeService) {
      return {
        current: null,
        queue: [],
        isProcessing: false,
      }
    }

    return globalClaudeService.getQueueStatus()
  }
}
