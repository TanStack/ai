import { useState } from 'react'
import type { ClaudeMode, TodoItem } from '../../chat-server/chat-api'

interface TodoListProps {
  todos: Array<TodoItem>
  claudeMode: ClaudeMode
  isJoined: boolean
  onAddTodo: (text: string) => Promise<{ success: boolean; error?: string }>
  onRemoveTodo: (id: string) => Promise<{ success: boolean; error?: string }>
  onClaudeModeChange: (
    mode: ClaudeMode,
  ) => Promise<{ success: boolean; error?: string }>
}

export function TodoList({
  todos,
  claudeMode,
  isJoined,
  onAddTodo,
  onRemoveTodo,
  onClaudeModeChange,
}: TodoListProps) {
  const [text, setText] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!text.trim() || !isJoined || isSubmitting) return

    setIsSubmitting(true)
    setError(null)
    try {
      const result = await onAddTodo(text)
      if (result.success) {
        setText('')
      } else {
        setError(result.error || 'Failed to add todo')
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleRemove = async (id: string) => {
    setError(null)
    const result = await onRemoveTodo(id)
    if (!result.success) {
      setError(result.error || 'Failed to remove todo')
    }
  }

  const handleModeChange = async (mode: ClaudeMode) => {
    if (mode === claudeMode || !isJoined) return
    setError(null)
    const result = await onClaudeModeChange(mode)
    if (!result.success) {
      setError(result.error || 'Failed to change Claude mode')
    }
  }

  return (
    <div className="bg-gray-800 p-6 rounded-lg border border-gray-600 flex flex-col min-h-0">
      <div className="flex items-center justify-between mb-4 gap-2">
        <h2 className="text-xl font-bold text-white">Todo List</h2>
        <span className="text-xs text-gray-400">{todos.length} items</span>
      </div>

      <div className="mb-4 p-3 rounded border border-gray-600 bg-gray-900/40">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-white">Claude mode</span>
          <div className="flex rounded overflow-hidden border border-gray-600 text-xs">
            <button
              type="button"
              disabled={!isJoined}
              onClick={() => void handleModeChange('passive')}
              className={`px-3 py-1 transition-colors ${
                claudeMode === 'passive'
                  ? 'bg-purple-700 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              } disabled:opacity-50`}
            >
              Passive
            </button>
            <button
              type="button"
              disabled={!isJoined}
              onClick={() => void handleModeChange('active')}
              className={`px-3 py-1 transition-colors ${
                claudeMode === 'active'
                  ? 'bg-purple-700 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              } disabled:opacity-50`}
            >
              Active
            </button>
          </div>
        </div>
        <p className="text-xs text-gray-400 leading-relaxed">
          {claudeMode === 'passive' ? (
            <>
              Claude waits for <span className="text-purple-400">@Claude</span>{' '}
              before adding/removing todos or answering todo questions.
            </>
          ) : (
            <>
              Claude watches the chat for todo add/remove intent and todo
              questions — no mention required.
            </>
          )}
        </p>
      </div>

      <form onSubmit={handleAdd} className="flex gap-2 mb-3">
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Add a todo..."
          disabled={!isJoined || isSubmitting}
          className="flex-1 bg-gray-700 text-white border border-gray-600 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={!text.trim() || !isJoined || isSubmitting}
          className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white px-3 py-2 rounded text-sm font-medium transition-colors"
        >
          Add
        </button>
      </form>

      {error && <p className="text-red-400 text-xs mb-2">{error}</p>}

      <div className="flex-1 overflow-y-auto space-y-2 min-h-[120px] max-h-[280px]">
        {todos.length === 0 ? (
          <div className="text-gray-400 text-center text-sm py-6">
            No todos yet. Add one manually or ask Claude.
          </div>
        ) : (
          todos.map((todo) => (
            <div
              key={todo.id}
              className="flex items-start gap-2 p-2 rounded bg-gray-700 group"
            >
              <div className="flex-1 min-w-0">
                <p className="text-white text-sm break-words">{todo.text}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  by {todo.createdBy}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void handleRemove(todo.id)}
                disabled={!isJoined}
                className="shrink-0 text-gray-400 hover:text-red-400 text-xs px-2 py-1 rounded hover:bg-gray-600 transition-colors disabled:opacity-50"
                aria-label={`Remove ${todo.text}`}
              >
                Remove
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
