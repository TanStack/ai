'use client'

import { useState } from 'react'
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'
import { useNavigate } from '@tanstack/react-router'
import QuickPrompts from './QuickPrompts'
import SearchForm from './SearchForm'
import type { FormEvent } from 'react'

function Search() {
  const navigate = useNavigate()
  const [value, setValue] = useState('')

  const { sendMessage, error, isLoading } = useChat({
    connection: fetchServerSentEvents('/api/search'),
    onFinish(message) {
      if (message.role === 'assistant' && message.parts[0].type === 'text') {
        const result = message.parts[0].content
        const { name, parameters } = JSON.parse(result) || {}

        if (name && parameters) {
          navigate({ to: `/${name}`, search: parameters })
        }
      }
    },
  })

  function handleSubmit(event: FormEvent) {
    event.preventDefault()

    if (value.trim() && !isLoading) {
      sendMessage(value)
      setValue('')
    }
  }

  return (
    <div className="space-y-4">
      <SearchForm
        value={value}
        onChange={setValue}
        onSubmit={handleSubmit}
        isLoading={isLoading}
      />
      {error && (
        <p className="text-red-500 text-center text-sm">
          Error: {error.message}
        </p>
      )}
      <QuickPrompts onClick={setValue} />
    </div>
  )
}

export default Search
