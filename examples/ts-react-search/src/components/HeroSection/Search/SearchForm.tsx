'use client'

import {
  ArrowRightIcon,
  LoaderCircleIcon,
  MicIcon,
  SearchIcon,
} from 'lucide-react'
import { useEffect } from 'react'
import type { FormEvent } from 'react'
import { useSpeechRecognition } from '@/hooks/useSpeechRecognition'

const PLACEHOLDER = 'e.g. Show all the expired orders created this year'

type SearchFormProps = {
  value: string
  onChange: (value: string) => void
  onSubmit: (event: FormEvent) => void
  isLoading: boolean
}

function SearchForm({ onChange, onSubmit, value, isLoading }: SearchFormProps) {
  const { listening, transcript, startListening, stopListening } =
    useSpeechRecognition()

  useEffect(() => {
    if (transcript) {
      onChange(transcript)
    }
  }, [transcript])

  const hasValue = Boolean(value.trim().length)

  function handleQueryChange(event: FormEvent<HTMLInputElement>) {
    onChange(event.currentTarget.value)
  }

  function handleVoiceOverClick() {
    if (listening) {
      stopListening()
    } else {
      startListening()
    }
  }

  return (
    <form onSubmit={onSubmit}>
      <div className="relative bg-background rounded-2xl">
        <input
          className="placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input w-full border bg-background px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none md:text-sm focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] peer ps-11 pe-22 h-14 rounded-2xl"
          type="search"
          placeholder={PLACEHOLDER}
          name="query"
          value={value}
          onChange={handleQueryChange}
        />
        <div className="pointer-events-none absolute inset-y-0 start-0 flex items-center justify-center ps-4 text-muted-foreground/80">
          <SearchIcon className="size-4" />
        </div>
        <button
          className="absolute inset-y-3 end-12 flex size-8 items-center justify-center transition-[color,box-shadow,background-color] outline-none hover:text-foreground focus:z-10 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 data-[active=true]:text-blue-600 disabled:pointer-events-none disabled:opacity-40 cursor-pointer bg-input/70 hover:bg-input/50 rounded-full"
          type="button"
          data-active={listening}
          disabled={isLoading}
          onClick={handleVoiceOverClick}
        >
          <MicIcon className="size-4" />
        </button>
        <button
          className="absolute inset-y-0 end-0 flex h-full w-11 items-center justify-center rounded-e-2xl text-muted-foreground/80 transition-[color,box-shadow,background-color] outline-none hover:text-foreground focus:z-10 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer pr-2"
          type="submit"
          disabled={!hasValue || isLoading}
        >
          {isLoading ? (
            <LoaderCircleIcon className="size-4 animate-spin" />
          ) : (
            <ArrowRightIcon className="size-4" />
          )}
        </button>
      </div>
    </form>
  )
}

export default SearchForm
