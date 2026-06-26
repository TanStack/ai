# TanStack AI Qwik

Qwik v2 integration for TanStack AI.

```tsx
import { component$ } from '@qwik.dev/core'
import { useChat } from '@tanstack/ai-qwik'

export default component$(() => {
  const chat = useChat({ api: '/api/chat' })

  return (
    <form
      preventdefault:submit
      onSubmit$={async () => {
        await chat.sendMessage('Test the Qwik chat adapter')
      }}
    >
      <button type="submit" disabled={chat.isLoading.value}>
        Send
      </button>
    </form>
  )
})
```
