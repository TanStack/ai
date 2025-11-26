// Cap'n Web RPC server implementation for chat
import { RpcTarget } from "capnweb";
import { WebSocket } from "ws";
import { ChatLogic } from "./chat-logic.js";

// Global shared chat instance
export const globalChat = new ChatLogic({
  async onUserJoined(username) {
    await ChatServer.broadcastToAll({
      type: "user_joined",
      message: `${username} joined the chat`,
      username,
    });
  },

  async onUserLeft(username) {
    await ChatServer.broadcastToAll({
      type: "user_left",
      message: `${username} left the chat`,
      username,
    });
  },

  async onMessageSent(message) {
    await ChatServer.broadcastToAll({
      type: "message",
      message: message.message,
      username: message.username,
      timestamp: message.timestamp,
      id: message.id,
    });
  },
});

// Global registry of active RPC server instances
export const activeServers = new Set<ChatServer>();

// Message queue system for each user
export const userMessageQueues = new Map<string, Array<any>>();

// Global registry of client callbacks
export const clients = new Map<string, Function>();

// Chat Server Implementation (one per connection)
export class ChatServer extends RpcTarget {
  public currentUsername: string | null = null;
  private webSocket: WebSocket | null = null;

  constructor() {
    super();
    // Register this server instance
    activeServers.add(this);
    console.log(`📡 Registered new chat server. Total: ${activeServers.size}`);
  }

  // Set the WebSocket connection for this server instance
  setWebSocket(ws: WebSocket) {
    this.webSocket = ws;

    // Handle WebSocket disconnection
    ws.on("close", () => {
      if (this.currentUsername) {
        this.leaveChat();
        console.log(`🔌 WebSocket disconnected for ${this.currentUsername}`);
      }
      this.dispose();
    });
  }

  // Broadcast to all connected users
  static async broadcastToAll(notification: any, excludeUser?: string) {
    console.log(`📬 Broadcasting to all users: ${notification.type}`);

    let successCount = 0;
    const successful: string[] = [];

    for (const username of clients.keys()) {
      if (excludeUser && username === excludeUser) {
        continue;
      }

      // Add notification to user's message queue
      if (!userMessageQueues.has(username)) {
        userMessageQueues.set(username, []);
      }

      const queue = userMessageQueues.get(username)!;
      queue.push({
        ...notification,
        timestamp: notification.timestamp || new Date().toISOString(),
        id: notification.id || Math.random().toString(36).substr(2, 9),
      });

      // Keep queue size manageable (last 50 messages)
      if (queue.length > 50) {
        queue.splice(0, queue.length - 50);
      }

      successCount++;
      successful.push(username);
    }

    console.log(`📬 Broadcast successful: ${successCount} users notified`);
    return { successful, successCount };
  }

  // Cleanup when connection closes
  dispose() {
    activeServers.delete(this);
    if (this.currentUsername) {
      clients.delete(this.currentUsername);
      userMessageQueues.delete(this.currentUsername);
    }
    console.log(`📡 Unregistered chat server. Total: ${activeServers.size}`);
  }

  // Client joins the chat
  async joinChat(username: string, notificationCallback: Function) {
    console.log(`${username} is joining the chat`);
    this.currentUsername = username;

    // Register in global state
    clients.set(username, notificationCallback);

    // Add user to chat logic
    await globalChat.addUser(username);

    // Send welcome notification
    if (!userMessageQueues.has(username)) {
      userMessageQueues.set(username, []);
    }

    const welcomeMessage = {
      type: "welcome",
      message: `Welcome to the chat, ${username}! 👋`,
      timestamp: new Date().toISOString(),
      id: Math.random().toString(36).substr(2, 9),
    };

    userMessageQueues.get(username)!.push(welcomeMessage);

    return {
      message: "Successfully joined the chat",
      onlineUsers: globalChat.getOnlineUsers(),
      recentMessages: globalChat.getMessages().slice(-20), // Last 20 messages
    };
  }

  // Client leaves the chat
  async leaveChat() {
    if (!this.currentUsername) return;

    console.log(`${this.currentUsername} is leaving the chat`);
    await globalChat.removeUser(this.currentUsername);
    this.currentUsername = null;

    return {
      message: "Successfully left the chat",
    };
  }

  // Get current chat state
  getChatState() {
    return globalChat.getChatState();
  }

  // Poll for new messages from the queue
  async pollMessages() {
    if (!this.currentUsername) {
      return [];
    }

    const queue = userMessageQueues.get(this.currentUsername) || [];
    const messages = [...queue]; // Return copy

    // Clear the queue after reading
    userMessageQueues.set(this.currentUsername, []);

    if (messages.length > 0) {
      console.log(
        `📨 ${this.currentUsername} polling: returning ${messages.length} messages`
      );
    }

    return messages;
  }

  // Send a chat message
  async sendMessage(messageText: string) {
    if (!this.currentUsername) {
      throw new Error("You must join the chat first");
    }

    if (!messageText.trim()) {
      throw new Error("Message cannot be empty");
    }

    const message = await globalChat.sendMessage(
      this.currentUsername,
      messageText.trim()
    );

    return {
      message: "Message sent successfully",
      chatMessage: message,
    };
  }
}
