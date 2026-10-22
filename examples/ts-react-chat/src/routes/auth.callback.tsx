import { useEffect, useRef, useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import {
  completeChatGptSignIn,
  saveChatGptSignIn,
} from '@tanstack/ai-openai/siwc'
import type { ChatGptSignIn } from '@tanstack/ai-openai/siwc'
import { byok } from '@/lib/byok'

export const Route = createFileRoute('/auth/callback')({
  component: ChatGptCallback,
})

/**
 * Sign in with ChatGPT lands here. The code exchange runs on load. Saving
 * needs a click, because the passkey keyring asks for a WebAuthn prompt.
 */
function ChatGptCallback() {
  const navigate = useNavigate()
  const started = useRef(false)
  const [signIn, setSignIn] = useState<ChatGptSignIn | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    // The code is single-use. Strict Mode runs effects twice.
    if (started.current) return
    started.current = true
    completeChatGptSignIn().then(
      (result) => {
        if (result) setSignIn(result)
        else void navigate({ to: '/' })
      },
      (caught: unknown) =>
        setError(caught instanceof Error ? caught.message : 'Sign-in failed'),
    )
  }, [navigate])

  return (
    <div className="flex min-h-[calc(100vh-72px)] items-center justify-center bg-gray-900 p-4">
      <div className="w-full max-w-sm rounded-lg border border-gray-700 bg-gray-800/50 p-6 text-center text-white">
        {error ? (
          <>
            <p className="mb-4 text-sm text-red-400">{error}</p>
            <button
              type="button"
              className="rounded-md border border-gray-600 bg-gray-800 px-3 py-2 text-sm"
              onClick={() => void navigate({ to: '/' })}
            >
              Back to chat
            </button>
          </>
        ) : signIn ? (
          <button
            type="button"
            className="w-full rounded-md bg-orange-500 px-3 py-2 text-sm font-semibold"
            onClick={() => {
              saveChatGptSignIn(byok, signIn).then(
                () => navigate({ to: '/' }),
                (caught: unknown) =>
                  setError(
                    caught instanceof Error
                      ? caught.message
                      : 'Could not save sign-in',
                  ),
              )
            }}
          >
            Save ChatGPT sign-in
          </button>
        ) : (
          <p className="text-sm text-gray-400">Finishing ChatGPT sign-in…</p>
        )}
      </div>
    </div>
  )
}
