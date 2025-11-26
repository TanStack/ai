import { useState, useRef, useCallback } from "react";
import { newWebSocketRpcSession } from "capnweb";

export interface ChatAPI {
  joinChat(username: string, notificationCallback: Function): Promise<any>;
  sendMessage(message: string): Promise<any>;
  getChatState(): Promise<any>;
  pollMessages(): Promise<any[]>;
  leaveChat(): Promise<any>;
}

export interface ConnectionState {
  isConnected: boolean;
  isConnecting: boolean;
  connectionStatus: string;
  error: string | null;
}

export function useChatConnection() {
  const [state, setState] = useState<ConnectionState>({
    isConnected: false,
    isConnecting: false,
    connectionStatus: "Disconnected",
    error: null,
  });

  const apiRef = useRef<ChatAPI | null>(null);

  const connect = useCallback(() => {
    setState((prev) => ({
      ...prev,
      isConnecting: true,
      connectionStatus: "Connecting...",
      error: null,
    }));

    try {
      const protocol =
        typeof window !== "undefined" && window.location.protocol === "https:"
          ? "wss:"
          : "ws:";
      const wsUrl =
        typeof window !== "undefined"
          ? `${protocol}//${window.location.host}/api/websocket`
          : "ws://localhost:3000/api/websocket";

      console.log("Connecting to chat:", wsUrl);

      const api = newWebSocketRpcSession(wsUrl) as any as ChatAPI;
      apiRef.current = api;

      // Test connection
      api
        .getChatState()
        .then(() => {
          console.log("Chat RPC connection established");
          setState({
            isConnected: true,
            isConnecting: false,
            connectionStatus: "Connected",
            error: null,
          });
        })
        .catch((error) => {
          console.error("Chat connection failed:", error);
          setState({
            isConnected: false,
            isConnecting: false,
            connectionStatus: "Failed to connect",
            error: error.message,
          });
        });
    } catch (error) {
      console.error("Failed to create chat session:", error);
      setState({
        isConnected: false,
        isConnecting: false,
        connectionStatus: "Failed to connect",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }, []);

  const disconnect = useCallback(() => {
    if (apiRef.current) {
      apiRef.current = null;
    }
    setState({
      isConnected: false,
      isConnecting: false,
      connectionStatus: "Disconnected",
      error: null,
    });
  }, []);

  return {
    ...state,
    api: apiRef.current,
    connect,
    disconnect,
  };
}
