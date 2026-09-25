export type ChatNotificationType =
  | 'message'
  | 'user_joined'
  | 'user_left'
  | 'welcome'
  | 'claude_responding'
  | 'claude_idle'
  | 'claude_error'
  | 'todos_updated'
  | 'claude_mode_changed'

export type ClaudeMode = 'active' | 'passive'

export interface TodoItem {
  id: string
  text: string
  createdAt: string
  createdBy: string
}

export interface ChatNotification {
  type: ChatNotificationType
  message: string
  username?: string
  timestamp?: string
  id?: string
  onlineUsers?: Array<string>
  todos?: Array<TodoItem>
  claudeMode?: ClaudeMode
}

export interface ChatMessage {
  id: string
  username: string
  message: string
  timestamp: string
  type?: ChatNotificationType
}

export interface ChatRoomState {
  onlineUsers: Array<string>
  messages: Array<ChatMessage>
}

export interface ChatState extends ChatRoomState {
  todos: Array<TodoItem>
  claudeMode: ClaudeMode
}

export interface JoinResult {
  message: string
  onlineUsers: Array<string>
  recentMessages: Array<ChatMessage>
  todos: Array<TodoItem>
  claudeMode: ClaudeMode
}

export interface SendResult {
  message: string
  chatMessage?: ChatMessage
}

export interface ClaudeQueueStatus {
  current: string | null
  queue: Array<string>
  isProcessing: boolean
  /** False for active-mode watches that may silently NO_REPLY */
  showResponding: boolean
}

export interface ChatNotifierApi {
  notify: (notification: ChatNotification) => void | Promise<void>
}

export interface ChatApi {
  joinChat: (username: string) => JoinResult
  leaveChat: () => { message: string }
  getChatState: () => ChatState
  sendMessage: (message: string) => SendResult
  getClaudeQueueStatus: () => ClaudeQueueStatus
  getTodos: () => Array<TodoItem>
  addTodo: (text: string) => { todo: TodoItem; todos: Array<TodoItem> }
  removeTodo: (id: string) => { success: boolean; todos: Array<TodoItem> }
  getClaudeMode: () => ClaudeMode
  setClaudeMode: (mode: ClaudeMode) => { mode: ClaudeMode }
}
