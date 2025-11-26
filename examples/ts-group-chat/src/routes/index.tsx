import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";

import { useChatConnection } from "@/hooks/useChatConnection";
import { useChatMessages } from "@/hooks/useChatMessages";
import { useClaude } from "@/hooks/useClaude";
import { UserSelector } from "@/components/UserSelector";
import { ChatInterface } from "@/components/ChatInterface";
import { OnlineUsers } from "@/components/OnlineUsers";

export const Route = createFileRoute("/")({
  component: ChatApp,
});

function ChatApp() {
  const [username, setUsername] = useState("");

  const { isConnected, isConnecting, error, api, connect } =
    useChatConnection();

  const { chatState, sendMessage } = useChatMessages(
    api,
    isConnected,
    username || null
  );

  const { queueStatus } = useClaude(api, isConnected);

  useEffect(() => {
    if (!isConnected && !isConnecting && !error) {
      connect();
    }
  }, [isConnected, isConnecting, error, connect]);

  return (
    <div className="h-screen bg-gray-900 text-white flex flex-col overflow-hidden">
      <div className="container mx-auto px-4 py-4 max-w-6xl flex-1 flex flex-col">
        {error && (
          <div className="mb-4 bg-red-800 border border-red-600 text-red-200 p-4 rounded-lg">
            <strong>Connection Error:</strong> {error}
            <button
              onClick={connect}
              className="ml-4 bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded text-sm"
            >
              Retry
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 flex-1 min-h-0">
          {/* Left Column - Main Chat Interface */}
          <div className="md:col-span-2 flex flex-col min-h-0 space-y-4">
            <UserSelector
              username={username}
              onUsernameChange={setUsername}
              isConnected={isConnected}
            />

            <ChatInterface
              messages={chatState.messages}
              onSendMessage={sendMessage}
              username={username}
              claudeQueueStatus={queueStatus}
            />
          </div>

          {/* Right Column - Online Users & Info */}
          <div className="flex flex-col">
            <OnlineUsers
              onlineUsers={chatState.onlineUsers}
              currentUsername={username || null}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
