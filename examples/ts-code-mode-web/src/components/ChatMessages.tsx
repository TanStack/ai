import { User, Bot } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import CodeBlock from './CodeBlock'
import ExecutionResult from './ExecutionResult'

export interface MessagePart {
  type: 'text' | 'code' | 'result'
  content: string
  status?: 'pending' | 'running' | 'success' | 'error'
  logs?: string[]
  result?: unknown
  error?: string
}

export interface Message {
  id: string
  role: 'user' | 'assistant'
  parts: MessagePart[]
  timestamp: Date
}

interface ChatMessagesProps {
  messages: Message[]
  isLoading?: boolean
}

export default function ChatMessages({
  messages,
  isLoading,
}: ChatMessagesProps) {
  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400">
        <div className="text-center max-w-md">
          <h2 className="text-xl font-semibold text-gray-200 mb-2">
            Code Mode Analytics
          </h2>
          <p className="mb-4">
            Ask questions about GitHub repositories or NPM packages. The AI will
            write and execute analysis code in a secure sandbox.
          </p>
          <div className="text-sm text-left bg-gray-800 rounded-lg p-4">
            <p className="font-medium mb-2 text-gray-300">Try asking:</p>
            <ul className="space-y-1 text-gray-400">
              <li>"What are the hottest React state management libraries?"</li>
              <li>"How many downloads did zustand get last month?"</li>
              <li>"Compare React Query vs SWR downloads"</li>
            </ul>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto p-4">
      <div className="max-w-4xl mx-auto space-y-4">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex gap-3 ${message.role === 'user' ? 'justify-end' : ''}`}
          >
            {message.role === 'assistant' && (
              <div className="w-8 h-8 rounded-full bg-cyan-900 flex items-center justify-center flex-shrink-0">
                <Bot size={18} className="text-cyan-400" />
              </div>
            )}

            <div
              className={`max-w-[80%] ${
                message.role === 'user'
                  ? 'bg-cyan-600 text-white rounded-lg px-4 py-2'
                  : 'bg-gray-800 border border-gray-700 rounded-lg px-4 py-3'
              }`}
            >
              {message.parts.map((part, index) => (
                <div key={index} className={index > 0 ? 'mt-3' : ''}>
                  {part.type === 'text' && (
                    <div
                      className={
                        message.role === 'user'
                          ? ''
                          : 'prose prose-sm prose-invert max-w-none'
                      }
                    >
                      {message.role === 'user' ? (
                        part.content
                      ) : (
                        <ReactMarkdown>{part.content}</ReactMarkdown>
                      )}
                    </div>
                  )}

                  {part.type === 'code' && (
                    <CodeBlock
                      code={part.content}
                      status={part.status}
                      collapsible={true}
                    />
                  )}

                  {part.type === 'result' && (
                    <ExecutionResult
                      result={part.result}
                      error={part.error}
                      logs={part.logs}
                      status={
                        part.status === 'pending'
                          ? 'running'
                          : part.status || 'success'
                      }
                    />
                  )}
                </div>
              ))}
            </div>

            {message.role === 'user' && (
              <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center flex-shrink-0">
                <User size={18} className="text-gray-300" />
              </div>
            )}
          </div>
        ))}

        {isLoading && (
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-full bg-cyan-900 flex items-center justify-center flex-shrink-0">
              <Bot size={18} className="text-cyan-400" />
            </div>
            <div className="bg-gray-800 border border-gray-700 rounded-lg px-4 py-3">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-cyan-500 rounded-full animate-bounce" />
                <div
                  className="w-2 h-2 bg-cyan-500 rounded-full animate-bounce"
                  style={{ animationDelay: '0.1s' }}
                />
                <div
                  className="w-2 h-2 bg-cyan-500 rounded-full animate-bounce"
                  style={{ animationDelay: '0.2s' }}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
