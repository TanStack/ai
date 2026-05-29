// Shorthand-key edge case: `body` is a local variable, passed via
// shorthand. After the rename, the call must still reference the
// `body` identifier (i.e. `forwardedProps: body`), NOT the literal
// `forwardedProps` (which is undefined in this scope).

import { useChat, fetchServerSentEvents } from '@tanstack/ai-react'

export function Chat() {
  const body = { provider: 'openai' }
  const result = useChat({
    connection: fetchServerSentEvents('/api/chat'),
    body,
  })
  return result
}
