// Conflict case: both `body` and `forwardedProps` are already set.
// The codemod must leave this alone — renaming would produce a
// duplicate-key object literal and silently drop one of the values.

import { useChat, fetchServerSentEvents } from '@tanstack/ai-react'

export function Chat() {
  const result = useChat({
    connection: fetchServerSentEvents('/api/chat'),
    body: { legacy: true },
    forwardedProps: { newer: true },
  })
  return result
}
