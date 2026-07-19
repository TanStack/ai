export type ChatNotificationType =
  | 'message'
  | 'user_joined'
  | 'user_left'
  | 'welcome'
  | 'claude_responding'
  | 'claude_error'

export interface ChatNotification {
  type: ChatNotificationType
  message: string
  username?: string
  timestamp?: string
  id?: string
  onlineUsers?: string[]
}

export interface ChatMessage {
  id: string
  username: string
  message: string
  timestamp: string
  type?: ChatNotificationType
}

export interface ChatState {
  onlineUsers: string[]
  messages: ChatMessage[]
}

export interface JoinResult {
  message: string
  onlineUsers: string[]
  recentMessages: ChatMessage[]
}

export interface SendResult {
  message: string
  chatMessage?: ChatMessage
}

export interface ClaudeQueueStatus {
  current: string | null
  queue: string[]
  isProcessing: boolean
}

export interface ChatNotifierApi {
  notify(notification: ChatNotification): void | Promise<void>
}

export interface ChatApi {
  joinChat(username: string): JoinResult
  leaveChat(): { message: string }
  getChatState(): ChatState
  sendMessage(message: string): SendResult
  getClaudeQueueStatus(): ClaudeQueueStatus
}
