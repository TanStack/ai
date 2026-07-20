// Core chat business logic and data structures
import type { ChatMessage, ChatRoomState } from './chat-api.js'

export type { ChatMessage, ChatRoomState }

// Core chat business logic class
export class ChatLogic {
  private chatState: ChatRoomState = {
    onlineUsers: [],
    messages: [],
  }

  // Event callbacks
  private onUserJoined?: (username: string) => Promise<void>
  private onUserLeft?: (username: string) => Promise<void>
  private onMessageSent?: (message: ChatMessage) => Promise<void>

  constructor(callbacks?: {
    onUserJoined?: (username: string) => Promise<void>
    onUserLeft?: (username: string) => Promise<void>
    onMessageSent?: (message: ChatMessage) => Promise<void>
  }) {
    this.onUserJoined = callbacks?.onUserJoined
    this.onUserLeft = callbacks?.onUserLeft
    this.onMessageSent = callbacks?.onMessageSent
  }

  addUserSync(username: string) {
    if (!this.chatState.onlineUsers.includes(username)) {
      this.chatState.onlineUsers.push(username)
      console.log(`✅ ${username} joined the chat`)

      if (this.onUserJoined) {
        void this.onUserJoined(username)
      }
    }
  }

  removeUserSync(username: string) {
    const index = this.chatState.onlineUsers.indexOf(username)
    if (index > -1) {
      this.chatState.onlineUsers.splice(index, 1)
      console.log(`👋 ${username} left the chat`)

      if (this.onUserLeft) {
        void this.onUserLeft(username)
      }
    }
  }

  sendMessageSync(username: string, messageText: string): ChatMessage {
    const message: ChatMessage = {
      id: Math.random().toString(36).substr(2, 9),
      username,
      message: messageText,
      timestamp: new Date().toISOString(),
    }

    this.chatState.messages.push(message)
    if (this.chatState.messages.length > 100) {
      this.chatState.messages = this.chatState.messages.slice(-100)
    }

    console.log(`💬 ${username}: ${messageText}`)

    if (this.onMessageSent) {
      void this.onMessageSent(message)
    }

    return message
  }

  async addUser(username: string) {
    if (!this.chatState.onlineUsers.includes(username)) {
      this.chatState.onlineUsers.push(username)
      console.log(`✅ ${username} joined the chat`)

      if (this.onUserJoined) {
        await this.onUserJoined(username)
      }
    }
  }

  async removeUser(username: string) {
    const index = this.chatState.onlineUsers.indexOf(username)
    if (index > -1) {
      this.chatState.onlineUsers.splice(index, 1)
      console.log(`👋 ${username} left the chat`)

      if (this.onUserLeft) {
        await this.onUserLeft(username)
      }
    }
  }

  async sendMessage(
    username: string,
    messageText: string,
  ): Promise<ChatMessage> {
    const message: ChatMessage = {
      id: Math.random().toString(36).substr(2, 9),
      username,
      message: messageText,
      timestamp: new Date().toISOString(),
    }

    console.log(
      `💬 ChatLogic.sendMessage() - username: ${username}, messageId: ${message.id}`,
    )
    console.log(
      `💬 Message text (first 80 chars): "${messageText.substring(0, 80)}"`,
    )

    // Add to messages (keep last 100 messages)
    this.chatState.messages.push(message)
    console.log(
      `💬 Message added to chatState. Total messages: ${this.chatState.messages.length}`,
    )

    if (this.chatState.messages.length > 100) {
      this.chatState.messages = this.chatState.messages.slice(-100)
    }

    console.log(`💬 ${username}: ${messageText}`)

    if (this.onMessageSent) {
      console.log(`💬 Calling onMessageSent callback...`)
      await this.onMessageSent(message)
      console.log(`💬 onMessageSent callback complete`)
    } else {
      console.log(`💬 No onMessageSent callback registered`)
    }

    return message
  }

  getChatState(): ChatRoomState {
    return {
      onlineUsers: [...this.chatState.onlineUsers],
      messages: [...this.chatState.messages],
    }
  }

  getMessages(): Array<ChatMessage> {
    return [...this.chatState.messages]
  }

  getOnlineUsers(): Array<string> {
    return [...this.chatState.onlineUsers]
  }
}
