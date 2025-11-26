import { useState } from "react";
import type { ChatMessage } from "../hooks/useChatMessages";

interface ChatInterfaceProps {
  messages: ChatMessage[];
  onSendMessage: (
    message: string
  ) => Promise<{ success: boolean; error?: string }>;
  username: string | null;
}

export function ChatInterface({
  messages,
  onSendMessage,
  username,
}: ChatInterfaceProps) {
  const [messageText, setMessageText] = useState("");
  const [isSending, setIsSending] = useState(false);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!messageText.trim() || !username || isSending) return;

    setIsSending(true);
    try {
      const result = await onSendMessage(messageText);
      if (result.success) {
        setMessageText("");
      } else {
        console.error("Failed to send message:", result.error);
      }
    } catch (error) {
      console.error("Error sending message:", error);
    } finally {
      setIsSending(false);
    }
  };

  const formatTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getMessageStyle = (msg: ChatMessage) => {
    switch (msg.type) {
      case "user_joined":
        return "text-green-400 italic";
      case "user_left":
        return "text-red-400 italic";
      case "welcome":
        return "text-blue-400 italic";
      default:
        return "text-white";
    }
  };

  return (
    <div className="bg-gray-800 p-6 rounded-lg border border-gray-600 h-96 flex flex-col">
      <h2 className="text-xl font-bold mb-4 text-white">💬 Chat Messages</h2>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto mb-4 space-y-2">
        {messages.length === 0 ? (
          <div className="text-gray-400 text-center py-8">
            No messages yet. Start a conversation! 👋
          </div>
        ) : (
          messages
            .map((msg) => {
              // Ensure we have proper message data
              if (!msg || !msg.id) {
                console.warn("Invalid message:", msg);
                return null;
              }

              const isRegularMessage = msg.type === "message" || !msg.type;
              const isOwnMessage =
                isRegularMessage && msg.username === username && username;
              const isSystemMessage = msg.type && msg.type !== "message";

              if (isSystemMessage) {
                return (
                  <div key={msg.id} className="flex justify-center my-2">
                    <div
                      className={`px-3 py-1 rounded-full text-xs ${getMessageStyle(
                        msg
                      )}`}
                    >
                      <span>{msg.message}</span>
                      <span className="text-gray-500 ml-2">
                        {formatTime(msg.timestamp)}
                      </span>
                    </div>
                  </div>
                );
              }

              // Regular chat message
              return (
                <div
                  key={msg.id}
                  className={`flex mb-2 ${
                    isOwnMessage ? "justify-end" : "justify-start"
                  }`}
                >
                  <div className="flex flex-col max-w-xs lg:max-w-md">
                    {!isOwnMessage && msg.username && (
                      <div className="text-blue-400 font-medium text-xs mb-1 ml-3">
                        {msg.username}
                      </div>
                    )}
                    <div
                      className={`px-3 py-2 rounded-lg ${
                        isOwnMessage
                          ? "bg-blue-600 text-white rounded-br-sm"
                          : "bg-gray-700 text-white rounded-bl-sm"
                      }`}
                    >
                      <div className="break-words">{msg.message}</div>
                      <div
                        className={`text-xs mt-1 ${
                          isOwnMessage ? "text-blue-100" : "text-gray-400"
                        }`}
                      >
                        {formatTime(msg.timestamp)}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
            .filter(Boolean)
        )}
      </div>

      {/* Message Input */}
      {username ? (
        <form onSubmit={handleSendMessage} className="flex space-x-2">
          <input
            type="text"
            value={messageText}
            onChange={(e) => setMessageText(e.target.value)}
            placeholder="Type your message..."
            className="flex-1 bg-gray-700 text-white border border-gray-600 rounded px-3 py-2 focus:outline-none focus:border-blue-500"
            disabled={isSending}
          />
          <button
            type="submit"
            disabled={!messageText.trim() || isSending}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white px-4 py-2 rounded font-medium transition-colors"
          >
            {isSending ? "Sending..." : "Send"}
          </button>
        </form>
      ) : (
        <div className="text-gray-400 text-center py-2">
          Please set your username to send messages
        </div>
      )}
    </div>
  );
}
