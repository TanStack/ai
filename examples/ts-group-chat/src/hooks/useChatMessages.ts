import { useState, useEffect, useCallback } from "react";
import type { ChatAPI } from "./useChatConnection";

export interface ChatMessage {
  id: string;
  username: string;
  message: string;
  timestamp: string;
  type?: "message" | "user_joined" | "user_left" | "welcome";
}

export interface ChatState {
  onlineUsers: string[];
  messages: ChatMessage[];
}

export function useChatMessages(
  api: ChatAPI | null,
  isConnected: boolean,
  username: string | null
) {
  const [chatState, setChatState] = useState<ChatState>({
    onlineUsers: [],
    messages: [],
  });

  const [isPolling, setIsPolling] = useState(false);
  const [isJoined, setIsJoined] = useState(false);

  // Poll for new messages
  const pollMessages = useCallback(async () => {
    if (!api || !isConnected || !username || isPolling) {
      return;
    }

    try {
      setIsPolling(true);
      const newMessages = await api.pollMessages();

      if (newMessages.length > 0) {
        setChatState((prev) => ({
          ...prev,
          messages: [...prev.messages, ...newMessages].slice(-100), // Keep last 100 messages
        }));
      }
    } catch (error) {
      console.error("Error polling messages:", error);
    } finally {
      setIsPolling(false);
    }
  }, [api, isConnected, username, isPolling]);

  // Update chat state from server
  const updateChatState = useCallback(async () => {
    if (!api || !isConnected) return;

    try {
      const state = await api.getChatState();
      setChatState(state);
    } catch (error) {
      console.error("Error updating chat state:", error);
    }
  }, [api, isConnected]);

  // Send a message
  const sendMessage = useCallback(
    async (messageText: string) => {
      if (!api || !messageText.trim()) {
        return { success: false, error: "Cannot send empty message" };
      }

      try {
        await api.sendMessage(messageText);
        return { success: true };
      } catch (error) {
        console.error("Error sending message:", error);
        return {
          success: false,
          error:
            error instanceof Error ? error.message : "Failed to send message",
        };
      }
    },
    [api]
  );

  // Join chat
  const joinChat = useCallback(
    async (chatUsername: string) => {
      if (!api) return { success: false, error: "Not connected" };

      try {
        const result = await api.joinChat(chatUsername, () => {
          // Notification callback - not used in polling approach
        });

        // Load initial state
        setChatState({
          onlineUsers: result.onlineUsers || [],
          messages: result.recentMessages || [],
        });

        return { success: true };
      } catch (error) {
        console.error("Error joining chat:", error);
        return {
          success: false,
          error: error instanceof Error ? error.message : "Failed to join chat",
        };
      }
    },
    [api]
  );

  // Leave chat
  const leaveChat = useCallback(async () => {
    if (!api) return;

    try {
      await api.leaveChat();
      setChatState({ onlineUsers: [], messages: [] });
    } catch (error) {
      console.error("Error leaving chat:", error);
    }
  }, [api]);

  // Auto-join when username is provided
  useEffect(() => {
    if (!api || !isConnected || !username || isJoined) return;

    const autoJoin = async () => {
      try {
        const result = await api.joinChat(username, () => {});
        setChatState({
          onlineUsers: result.onlineUsers || [],
          messages: result.recentMessages || [],
        });
        setIsJoined(true);
      } catch (error) {
        console.error("Error auto-joining chat:", error);
      }
    };

    autoJoin();
  }, [api, isConnected, username, isJoined]);

  // Auto-leave when username is cleared
  useEffect(() => {
    if (!username && isJoined && api) {
      const autoLeave = async () => {
        try {
          await api.leaveChat();
          setIsJoined(false);
          setChatState({ onlineUsers: [], messages: [] });
        } catch (error) {
          console.error("Error auto-leaving chat:", error);
        }
      };
      autoLeave();
    }
  }, [username, isJoined, api]);

  // Set up polling interval when connected and joined
  useEffect(() => {
    if (!isConnected || !username || !isJoined) return;

    const interval = setInterval(pollMessages, 1000); // Poll every second

    return () => clearInterval(interval);
  }, [isConnected, username, isJoined, pollMessages]);

  // Update chat state periodically to get online users
  useEffect(() => {
    if (!isConnected || !username || !isJoined) return;

    const interval = setInterval(updateChatState, 5000); // Update every 5 seconds

    return () => clearInterval(interval);
  }, [isConnected, username, isJoined, updateChatState]);

  return {
    chatState,
    sendMessage,
    joinChat,
    leaveChat,
    isJoined,
  };
}
