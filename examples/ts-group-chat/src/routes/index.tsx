import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";

import { useChatConnection } from "@/hooks/useChatConnection";
import { useChatMessages } from "@/hooks/useChatMessages";
import { UsernameInput } from "@/components/UsernameInput";
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

  useEffect(() => {
    if (!isConnected && !isConnecting && !error) {
      connect();
    }
  }, [isConnected, isConnecting, error, connect]);

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        {error && (
          <div className="mb-6 bg-red-800 border border-red-600 text-red-200 p-4 rounded-lg">
            <strong>Connection Error:</strong> {error}
            <button
              onClick={connect}
              className="ml-4 bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded text-sm"
            >
              Retry
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Left Column - Main Chat Interface */}
          <div className="md:col-span-2 space-y-6">
            <UsernameInput
              username={username}
              onUsernameChange={setUsername}
              isConnected={isConnected}
            />

            <ChatInterface
              messages={chatState.messages}
              onSendMessage={sendMessage}
              username={username}
            />
          </div>

          {/* Right Column - Online Users & Info */}
          <div className="space-y-6">
            <OnlineUsers
              onlineUsers={chatState.onlineUsers}
              currentUsername={username || null}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="mt-12 pt-8 border-t border-gray-700 text-center text-gray-400 text-sm">
          <div className="mb-2">
            🚀 Built with{" "}
            <a
              href="https://github.com/cloudflare/capnweb"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 hover:text-blue-300 transition-colors"
            >
              Cap'n Web RPC
            </a>{" "}
            &{" "}
            <a
              href="https://tanstack.com/start"
              target="_blank"
              rel="noopener noreferrer"
              className="text-purple-400 hover:text-purple-300 transition-colors"
            >
              TanStack Start
            </a>
          </div>
          <div className="text-xs text-gray-500">
            A simple demo of real-time bidirectional web communication
          </div>
        </div>
      </div>
    </div>
  );
}
