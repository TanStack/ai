import { Send } from 'lucide-react'
import { useState, useRef, useEffect } from 'react'

interface ChatInputProps {
  onSend: (message: string) => void
  disabled?: boolean
  placeholder?: string
  exampleQueries?: string
}

export default function ChatInput({
  onSend,
  disabled = false,
  placeholder = 'Ask a question about GitHub or NPM analytics...',
  exampleQueries = '"Show download trends for @tanstack/query" | "Find repos with unusual growth" | "Compare React state libraries"',
}: ChatInputProps) {
  const [input, setInput] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`
    }
  }, [input])

  const handleSubmit = () => {
    if (input.trim() && !disabled) {
      onSend(input.trim())
      setInput('')
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  return (
    <div className="border-t border-gray-700 bg-gray-800 p-4">
      <div className="max-w-4xl mx-auto">
        <div className="flex gap-3 items-end">
          <div className="flex-1 relative">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              disabled={disabled}
              rows={1}
              className="w-full px-4 py-3 bg-gray-900 border border-gray-600 rounded-lg resize-none text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent disabled:bg-gray-800 disabled:text-gray-500 disabled:cursor-not-allowed"
            />
          </div>
          <button
            onClick={handleSubmit}
            disabled={disabled || !input.trim()}
            className="p-3 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Send size={20} />
          </button>
        </div>

        <div className="mt-2 text-xs text-gray-500">
          <strong className="text-gray-400">Example queries:</strong>
          <span className="ml-2">{exampleQueries}</span>
        </div>
      </div>
    </div>
  )
}
