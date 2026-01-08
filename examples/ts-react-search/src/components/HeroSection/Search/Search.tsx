'use client'

import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useMutation } from '@tanstack/react-query'
import QuickPrompts from './QuickPrompts'
import SearchForm from './SearchForm'
import type { FormEvent } from 'react'

function Search() {
  const navigate = useNavigate()
  const [value, setValue] = useState('')

  const { mutate, isPending, error } = useMutation({
    mutationFn: async (content: string) => {
      const response = await fetch('/api/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ content }),
      })

      if (!response.ok) {
        throw new Error('Search request failed')
      }

      return response.json()
    },
    onSuccess: async (json) => {
      const { name, parameters } = json?.data ?? {}

      if (name && parameters) {
        await navigate({ to: `/${name}`, search: parameters })
      }
    },
  })

  function handleSubmit(event: FormEvent) {
    event.preventDefault()

    if (value.trim() && !isPending) {
      mutate(value)
      setValue('')
    }
  }

  return (
    <div className="space-y-4">
      <SearchForm
        value={value}
        onChange={setValue}
        onSubmit={handleSubmit}
        isLoading={isPending}
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
