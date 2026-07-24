import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'

import { useChatConnection } from '@/hooks/useChatConnection'
import { useChatMessages } from '@/hooks/useChatMessages'
import { useClaude } from '@/hooks/useClaude'
import { useTodos } from '@/hooks/useTodos'
import { UserSelector } from '@/components/UserSelector'
import { ChatInterface } from '@/components/ChatInterface'
import { OnlineUsers } from '@/components/OnlineUsers'
import { TodoList } from '@/components/TodoList'

export const Route = createFileRoute('/')({
  component: ChatApp,
})

function ChatApp() {
  const [username, setUsername] = useState('')

  const { isConnected, isConnecting, error, api, apiRef, notifier, connect } =
    useChatConnection()

  const { chatState, sendMessage, isJoined } = useChatMessages(
    api,
    apiRef,
    notifier,
    isConnected,
    username || null,
  )

  const { queueStatus } = useClaude(
    api,
    apiRef,
    notifier,
    isConnected,
    isJoined,
  )

  const { todos, claudeMode, addTodo, removeTodo, setClaudeMode } = useTodos(
    api,
    apiRef,
    notifier,
    isConnected,
    isJoined,
  )

  useEffect(() => {
    if (!isConnected && !isConnecting && !error) {
      connect()
    }
  }, [isConnected, isConnecting, error, connect])

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
              isJoined={isJoined}
              claudeQueueStatus={queueStatus}
            />
          </div>

          <div className="flex flex-col gap-4 min-h-0 overflow-y-auto">
            <TodoList
              todos={todos}
              claudeMode={claudeMode}
              isJoined={isJoined}
              onAddTodo={addTodo}
              onRemoveTodo={removeTodo}
              onClaudeModeChange={setClaudeMode}
            />

            <OnlineUsers
              onlineUsers={chatState.onlineUsers}
              currentUsername={username || null}
              claudeMode={claudeMode}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
