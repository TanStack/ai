import { useState } from 'react'

interface SummarizeUIProps {
  onSubmit: (text: string) => void
  result: string | null
  isLoading: boolean
}

export function SummarizeUI({ onSubmit, result, isLoading }: SummarizeUIProps) {
  const [input, setInput] = useState('')

  return (
    <div className="flex flex-col h-[calc(100vh-60px)] p-4 gap-4">
      <textarea
        data-testid="summarize-input"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="Paste text to summarize..."
        className="flex-1 bg-gray-800 border border-gray-700 rounded p-3 text-sm resize-none focus:outline-none focus:border-orange-500/50"
      />
      <button
        data-testid="summarize-button"
        onClick={() => onSubmit(input)}
        disabled={!input.trim() || isLoading}
        className="px-4 py-2 bg-orange-500 text-white rounded text-sm font-medium disabled:opacity-50 self-start"
      >
        {isLoading ? 'Summarizing...' : 'Summarize'}
      </button>
      {result && (
        <div
          data-testid="summarize-result"
          className="p-3 bg-gray-800/50 border border-gray-700 rounded text-sm"
        >
          {result}
        </div>
      )}
    </div>
  )
}
