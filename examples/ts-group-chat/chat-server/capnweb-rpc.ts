// Cap'n Web RPC server implementation for chat
import { RpcTarget } from 'capnweb'
import { ChatLogic } from './chat-logic.js'

import type { WebSocket } from 'ws'

// Local type definition to avoid importing from @tanstack/ai at module parse time
interface ModelMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content?: string
  toolCallId?: string
  toolCalls?: Array<any>
}

// Lazy-load claude service to avoid importing AI packages at module parse time
let globalClaudeService: any = null
async function getClaudeService() {
  if (!globalClaudeService) {
    const { globalClaudeService: service } = await import('./claude-service.js')
    globalClaudeService = service
  }
  return globalClaudeService
}

// Global shared chat instance
export const globalChat = new ChatLogic({
  async onUserJoined(username) {
    await ChatServer.broadcastToAll({
      type: 'user_joined',
      message: `${username} joined the chat`,
      username,
    })
  },

  async onUserLeft(username) {
    await ChatServer.broadcastToAll({
      type: 'user_left',
      message: `${username} left the chat`,
      username,
    })
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

// Message queue system for each user
export const userMessageQueues = new Map<string, Array<any>>()

// Global registry of client callbacks
export const clients = new Map<string, (...args: Array<any>) => void>()

// Chat Server Implementation (one per connection)
export class ChatServer extends RpcTarget {
  public currentUsername: string | null = null
  private webSocket: WebSocket | null = null

  constructor() {
    super()
    // Register this server instance
    activeServers.add(this)
    console.log(`📡 Registered new chat server. Total: ${activeServers.size}`)
  }

  // Set the WebSocket connection for this server instance
  setWebSocket(ws: WebSocket) {
    this.webSocket = ws

    // Handle WebSocket disconnection
    ws.on('close', () => {
      if (this.currentUsername) {
        this.leaveChat()
        console.log(`🔌 WebSocket disconnected for ${this.currentUsername}`)
      }
      this.dispose()
    })
  }

  // Broadcast to all connected users
  static async broadcastToAll(notification: any, excludeUser?: string) {
    const msgPreview = notification.message?.substring(0, 50) || ''
    console.log(
      `\n📬 broadcastToAll() - type: ${notification.type}, from: ${notification.username}, message: "${msgPreview}..."`,
    )
    console.log(`📬 Connected users: ${Array.from(clients.keys()).join(', ')}`)
    console.log(`📬 Exclude user: ${excludeUser || 'none'}`)

    let successCount = 0
    const successful: Array<string> = []

    for (const username of clients.keys()) {
      if (excludeUser && username === excludeUser) {
        console.log(`📬 Skipping excluded user: ${username}`)
        continue
      }

      // Add notification to user's message queue
      if (!userMessageQueues.has(username)) {
        userMessageQueues.set(username, [])
      }

      const queue = userMessageQueues.get(username)!
      const messageId =
        notification.id || Math.random().toString(36).substr(2, 9)

      queue.push({
        ...notification,
        timestamp: notification.timestamp || new Date().toISOString(),
        id: messageId,
      })

      console.log(
        `📬 Added to ${username}'s queue (queue size: ${queue.length}, messageId: ${messageId})`,
      )

      // Keep queue size manageable (last 50 messages)
      if (queue.length > 50) {
        queue.splice(0, queue.length - 50)
      }

      successCount++
      successful.push(username)
    }

    console.log(
      `📬 Broadcast complete: ${successCount} users notified (${successful.join(
        ', ',
      )})\n`,
    )
    return { successful, successCount }
  }

  // Cleanup when connection closes
  dispose() {
    activeServers.delete(this)
    if (this.currentUsername) {
      clients.delete(this.currentUsername)
      userMessageQueues.delete(this.currentUsername)
    }
    console.log(`📡 Unregistered chat server. Total: ${activeServers.size}`)
  }

  // Client joins the chat
  async joinChat(
    username: string,
    notificationCallback: (...args: Array<any>) => void,
  ) {
    console.log(`${username} is joining the chat`)
    this.currentUsername = username

    // Register in global state
    clients.set(username, notificationCallback)

    // Add user to chat logic
    await globalChat.addUser(username)

    // Send welcome notification
    if (!userMessageQueues.has(username)) {
      userMessageQueues.set(username, [])
    }

    const welcomeMessage = {
      type: 'welcome',
      message: `Welcome to the chat, ${username}! 👋`,
      timestamp: new Date().toISOString(),
      id: Math.random().toString(36).substr(2, 9),
    }

    userMessageQueues.get(username)!.push(welcomeMessage)

    return {
      message: 'Successfully joined the chat',
      onlineUsers: globalChat.getOnlineUsers(),
      recentMessages: globalChat.getMessages().slice(-20), // Last 20 messages
    }
  }

  // Client leaves the chat
  async leaveChat() {
    if (!this.currentUsername) return

    console.log(`${this.currentUsername} is leaving the chat`)
    await globalChat.removeUser(this.currentUsername)
    this.currentUsername = null

    return {
      message: 'Successfully left the chat',
    }
  }

  // Get current chat state
  getChatState() {
    return globalChat.getChatState()
  }

  // Poll for new messages from the queue
  async pollMessages() {
    if (!this.currentUsername) {
      return []
    }

    const queue = userMessageQueues.get(this.currentUsername) || []
    const messages = [...queue] // Return copy

    // Clear the queue after reading
    userMessageQueues.set(this.currentUsername, [])

    if (messages.length > 0) {
      console.log(
        `📨 ${this.currentUsername} polling: returning ${messages.length} messages`,
      )
    }

    return messages
  }

  // Send a chat message
  async sendMessage(messageText: string) {
    console.log(
      `\n📨 [${this.currentUsername}] sendMessage called: "${messageText}"`,
    )

    if (!this.currentUsername) {
      throw new Error('You must join the chat first')
    }

    if (!messageText.trim()) {
      throw new Error('Message cannot be empty')
    }

    // Check for Claude trigger pattern - matches @Claude anywhere in message or Claude at start
    const trimmedMessage = messageText.trim()
    const isClaudeMention =
      /@Claude/i.test(messageText) || // @Claude anywhere in message
      /^Claude/i.test(trimmedMessage) || // Claude at start
      /^@Claude/i.test(trimmedMessage) // @Claude at start
    console.log(
      `📨 [${this.currentUsername}] Checking for Claude mention in: "${messageText.substring(0, 50)}..."`,
    )
    console.log(
      `📨 [${this.currentUsername}] isClaudeMention: ${
        isClaudeMention ? 'YES' : 'NO'
      }`,
    )

    if (isClaudeMention) {
      console.log(
        `📨 [${this.currentUsername}] Claude mention detected, sending user message first`,
      )

      // First, send the user's message to chat
      const message = await globalChat.sendMessage(
        this.currentUsername,
        messageText.trim(),
      )
      console.log(
        `📨 [${this.currentUsername}] User message sent, ID: ${message.id}`,
      )

      // Build conversation history for Claude
      const conversationHistory: Array<ModelMessage> = globalChat
        .getMessages()
        .map((msg) => ({
          role: 'user' as const,
          content: `${msg.username}: ${msg.message}`,
        }))
      console.log(
        `📨 [${this.currentUsername}] Built history with ${conversationHistory.length} messages`,
      )

      // Enqueue Claude request
      const claudeService = await getClaudeService()
      claudeService.enqueue({
        id: Math.random().toString(36).substr(2, 9),
        username: this.currentUsername,
        message: messageText,
        conversationHistory,
      })
      console.log(`📨 [${this.currentUsername}] Claude request enqueued`)

      // Start processing immediately (will check queue internally)
      console.log(`📨 [${this.currentUsername}] Starting processClaudeQueue()`)
      this.processClaudeQueue()

      return {
        message: 'Claude request queued',
        chatMessage: message,
      }
    }

    // Regular message handling
    console.log(`📨 [${this.currentUsername}] Regular message, sending to chat`)
    const message = await globalChat.sendMessage(
      this.currentUsername,
      messageText.trim(),
    )
    console.log(`📨 [${this.currentUsername}] Message sent, ID: ${message.id}`)

    return {
      message: 'Message sent successfully',
      chatMessage: message,
    }
  }

  // Process Claude queue and stream response
  private async processClaudeQueue() {
    console.log(`\n🎯 processClaudeQueue() called`)

    const claudeService = await getClaudeService()
    const status = claudeService.getQueueStatus()
    console.log(
      `🎯 Queue status: processing=${status.isProcessing}, queue length=${status.queue.length}, current=${status.current}`,
    )

    // If already processing or queue is empty, return
    if (status.isProcessing || status.queue.length === 0) {
      console.log(
        `🎯 Skipping: ${
          status.isProcessing ? 'already processing' : 'queue empty'
        }`,
      )
      return
    }

    // Start processing
    console.log(`🎯 Starting to process queue`)
    claudeService.startProcessing()

    try {
      const currentStatus = claudeService.getQueueStatus()
      console.log(`🎯 Current user: ${currentStatus.current}`)

      // Broadcast that Claude is responding
      console.log(`🎯 Broadcasting claude_responding...`)
      await ChatServer.broadcastToAll({
        type: 'claude_responding',
        message: `Claude is responding to ${currentStatus.current}...`,
        username: 'System',
      })

      // Get conversation history from the current request
      const conversationHistory: Array<ModelMessage> = globalChat
        .getMessages()
        .map((msg) => ({
          role: 'user' as const,
          content: `${msg.username}: ${msg.message}`,
        }))
      console.log(
        `🎯 Built conversation history: ${conversationHistory.length} messages`,
      )

      // Stream Claude response and accumulate text
      console.log(`🎯 Starting to stream Claude response...`)
      let accumulatedResponse = ''
      for await (const chunk of claudeService.streamResponse(
        conversationHistory,
      )) {
        if (chunk.type === 'content' && chunk.delta) {
          accumulatedResponse += chunk.delta
        }
      }
      console.log(
        `🎯 Accumulated response (${
          accumulatedResponse.length
        } chars): "${accumulatedResponse.substring(0, 100)}..."`,
      )

      // Add Claude's response to chat history
      // Note: globalChat.sendMessage will automatically broadcast via onMessageSent callback
      console.log(
        `🎯 Adding Claude message to globalChat (this will auto-broadcast)...`,
      )
      const claudeMessage = await globalChat.sendMessage(
        'Claude',
        accumulatedResponse,
      )
      console.log(
        `🎯 Claude message added to globalChat and broadcast automatically, ID: ${claudeMessage.id}`,
      )
    } catch (error) {
      console.error('🎯 ERROR in processClaudeQueue:', error)

      // Broadcast error
      await ChatServer.broadcastToAll({
        type: 'claude_error',
        message: 'Claude encountered an error responding',
        username: 'System',
      })
    } finally {
      console.log(`🎯 Finishing processing...`)
      claudeService.finishProcessing()

      // Process next in queue if any
      console.log(`🎯 Checking for next in queue...`)
      this.processClaudeQueue()
    }
  }

  // Get Claude queue status
  async getClaudeQueueStatus() {
    const claudeService = await getClaudeService()
    return claudeService.getQueueStatus()
  }

  // Stream Claude response (for future use if needed)
  async *streamClaudeResponse(conversationHistory: Array<ModelMessage>) {
    const claudeService = await getClaudeService()
    yield* claudeService.streamResponse(conversationHistory)
  }
}
