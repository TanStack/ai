// Core chat business logic and data structures

export interface ChatMessage {
  id: string;
  username: string;
  message: string;
  timestamp: string;
}

export interface ChatState {
  onlineUsers: string[];
  messages: ChatMessage[];
}

// Core chat business logic class
export class ChatLogic {
  private chatState: ChatState = {
    onlineUsers: [],
    messages: [],
  };

  // Event callbacks
  private onUserJoined?: (username: string) => Promise<void>;
  private onUserLeft?: (username: string) => Promise<void>;
  private onMessageSent?: (message: ChatMessage) => Promise<void>;

  constructor(callbacks?: {
    onUserJoined?: (username: string) => Promise<void>;
    onUserLeft?: (username: string) => Promise<void>;
    onMessageSent?: (message: ChatMessage) => Promise<void>;
  }) {
    this.onUserJoined = callbacks?.onUserJoined;
    this.onUserLeft = callbacks?.onUserLeft;
    this.onMessageSent = callbacks?.onMessageSent;
  }

  async addUser(username: string) {
    if (!this.chatState.onlineUsers.includes(username)) {
      this.chatState.onlineUsers.push(username);
      console.log(`✅ ${username} joined the chat`);

      if (this.onUserJoined) {
        await this.onUserJoined(username);
      }
    }
  }

  async removeUser(username: string) {
    const index = this.chatState.onlineUsers.indexOf(username);
    if (index > -1) {
      this.chatState.onlineUsers.splice(index, 1);
      console.log(`👋 ${username} left the chat`);

      if (this.onUserLeft) {
        await this.onUserLeft(username);
      }
    }
  }

  async sendMessage(
    username: string,
    messageText: string
  ): Promise<ChatMessage> {
    const message: ChatMessage = {
      id: Math.random().toString(36).substr(2, 9),
      username,
      message: messageText,
      timestamp: new Date().toISOString(),
    };

    // Add to messages (keep last 100 messages)
    this.chatState.messages.push(message);
    if (this.chatState.messages.length > 100) {
      this.chatState.messages = this.chatState.messages.slice(-100);
    }

    console.log(`💬 ${username}: ${messageText}`);

    if (this.onMessageSent) {
      await this.onMessageSent(message);
    }

    return message;
  }

  getChatState(): ChatState {
    return {
      onlineUsers: [...this.chatState.onlineUsers],
      messages: [...this.chatState.messages],
    };
  }

  getMessages(): ChatMessage[] {
    return [...this.chatState.messages];
  }

  getOnlineUsers(): string[] {
    return [...this.chatState.onlineUsers];
  }
}
