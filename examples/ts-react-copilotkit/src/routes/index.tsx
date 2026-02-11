import { useState, useRef, useEffect, useMemo } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'
import type { UIMessage } from '@tanstack/ai-react'
import { CopilotKit } from '@copilotkit/react-core'
import { CopilotChat } from '@copilotkit/react-ui'
import { HttpAgent } from '@ag-ui/client'
import '@copilotkit/react-ui/styles.css'

type Tab = 'tanstack' | 'copilotkit'

/**
 * TanStack AI Chat Panel — uses the useChat hook from @tanstack/ai-react
 * to connect to the TanStack AI server endpoint via AG-UI SSE.
 */
function TanStackAIChat() {
  const { messages, sendMessage, isLoading, stop } = useChat({
    connection: fetchServerSentEvents('/api/chat'),
  })
  const [input, setInput] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = () => {
    if (!input.trim()) return
    sendMessage(input.trim())
    setInput('')
  }

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-center text-gray-500 mt-20">
            <p className="text-lg font-medium">TanStack AI Chat</p>
            <p className="text-sm mt-1">
              Using <code className="bg-gray-800 px-1.5 py-0.5 rounded text-orange-400">useChat</code> hook
              from <code className="bg-gray-800 px-1.5 py-0.5 rounded text-orange-400">@tanstack/ai-react</code>
            </p>
            <p className="text-sm mt-1 text-gray-600">
              Connected to TanStack AI server via AG-UI protocol
            </p>
          </div>
        )}
        {messages.map((message: UIMessage) => (
          <div
            key={message.id}
            className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                message.role === 'user'
                  ? 'bg-orange-600 text-white'
                  : 'bg-gray-800 text-gray-100'
              }`}
            >
              {message.parts.map((part, i) => {
                if (part.type === 'text' && part.content) {
                  return (
                    <p key={i} className="whitespace-pre-wrap">
                      {part.content}
                    </p>
                  )
                }
                return null
              })}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-gray-700 p-4">
        {isLoading && (
          <div className="flex justify-center mb-3">
            <button
              onClick={stop}
              className="px-4 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm transition-colors"
            >
              ■ Stop
            </button>
          </div>
        )}
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && input.trim()) {
                e.preventDefault()
                handleSend()
              }
            }}
            placeholder="Type a message..."
            disabled={isLoading}
            className="flex-1 rounded-xl border border-gray-600 bg-gray-800 px-4 py-3 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500/50 disabled:opacity-50"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            className="px-5 py-3 bg-orange-600 hover:bg-orange-700 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-xl font-medium transition-colors"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * CopilotKit Chat Panel — uses CopilotKit's React components connected
 * to the TanStack AI server endpoint via the AG-UI protocol.
 *
 * The HttpAgent from @ag-ui/client sends RunAgentInput to the TanStack AI
 * server and receives AG-UI SSE events back — this is the core of the
 * interoperability between the two frameworks.
 */
function CopilotKitChat() {
  // Cast needed due to minor type differences between @ag-ui/client and
  // CopilotKit's internal @ag-ui/core versions — both implement the same protocol
  const agents = useMemo(
    () =>
      ({
        'tanstack-ai': new HttpAgent({
          url: '/api/chat',
          agentId: 'tanstack-ai',
          description: 'TanStack AI agent connected via AG-UI protocol',
        }),
      }) as Record<string, any>,
    [],
  )

  return (
    <CopilotKit
      runtimeUrl="/api/chat"
      agents__unsafe_dev_only={agents}
      agent="tanstack-ai"
      showDevConsole={false}
    >
      <div className="flex flex-col h-full copilotkit-chat-container">
        <CopilotChat
          className="h-full"
          labels={{
            placeholder: 'Type a message...',
            initial:
              'Hello! I am powered by TanStack AI on the server and CopilotKit on the client, connected through the AG-UI protocol.',
          }}
        />
      </div>
    </CopilotKit>
  )
}

/**
 * Main page with tabbed interface showing both TanStack AI and CopilotKit
 * consuming the same AG-UI compliant TanStack AI server.
 */
function HomePage() {
  const [activeTab, setActiveTab] = useState<Tab>('tanstack')

  return (
    <div className="flex flex-col h-screen bg-gray-900 text-white">
      {/* Header */}
      <header className="border-b border-gray-700 bg-gray-800">
        <div className="px-6 py-4">
          <h1 className="text-xl font-bold bg-gradient-to-r from-orange-400 to-red-500 bg-clip-text text-transparent">
            TanStack AI + CopilotKit
          </h1>
          <p className="text-sm text-gray-400 mt-1">
            AG-UI Protocol Integration Demo
          </p>
        </div>

        {/* Tabs */}
        <div className="flex px-6 gap-1">
          <button
            onClick={() => setActiveTab('tanstack')}
            className={`px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors ${
              activeTab === 'tanstack'
                ? 'bg-gray-900 text-orange-400 border-t-2 border-orange-500'
                : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700/50'
            }`}
          >
            🔥 TanStack AI Client
          </button>
          <button
            onClick={() => setActiveTab('copilotkit')}
            className={`px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors ${
              activeTab === 'copilotkit'
                ? 'bg-gray-900 text-orange-400 border-t-2 border-orange-500'
                : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700/50'
            }`}
          >
            🪁 CopilotKit Client
          </button>
        </div>
      </header>

      {/* AG-UI Protocol Banner */}
      <div className="bg-gradient-to-r from-orange-900/30 to-red-900/30 border-b border-orange-500/20 px-6 py-3">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-orange-400 font-medium">AG-UI Protocol</span>
          <span className="text-gray-400">•</span>
          <span className="text-gray-300">
            Both clients communicate with the same TanStack AI server using the
            open AG-UI standard for agent-user interaction
          </span>
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'tanstack' ? <TanStackAIChat /> : <CopilotKitChat />}
      </div>
    </div>
  )
}

export const Route = createFileRoute('/')({
  component: HomePage,
})
