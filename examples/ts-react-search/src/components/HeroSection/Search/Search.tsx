'use client'

import { useState } from 'react'
import QuickPrompts from './QuickPrompts'
import SearchForm from './SearchForm'
import type { FormEvent } from 'react'
import useSearchMutation from '@/hooks/useSearchMutation.ts'

function Search() {
  const [value, setValue] = useState('')

  const { mutate: search, isPending, error } = useSearchMutation()

  function handleSubmit(event: FormEvent) {
    event.preventDefault()

    if (value.trim() && !isPending) {
      search(value)
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
