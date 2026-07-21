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

For client tools that capture browser-only APIs, create them inside a QRL with
`tools$`:

```tsx
import { $, component$ } from '@qwik.dev/core'
import { clientTools, useChat } from '@tanstack/ai-qwik'
import { savePreferenceTool } from './tools'

export default component$(() => {
  const tools$ = $(() =>
    clientTools(
      savePreferenceTool.client((input) => {
        localStorage.setItem('preference', input.preference)
        return { ok: true }
      }),
    ),
  )

  const chat = useChat({ api: '/api/chat', tools$ })

  return <button onClick$={() => chat.sendMessage('Recommend something')} />
})
```

Use the `$` callback options for handlers that capture component state:

```tsx
import { $, component$, useSignal } from '@qwik.dev/core'
import { useChat } from '@tanstack/ai-qwik'

export default component$(() => {
  const chunkCount = useSignal(0)

  const chat = useChat({
    api: '/api/chat',
    onChunk$: $(() => {
      chunkCount.value++
    }),
  })

  return <button onClick$={() => chat.sendMessage('Stream updates')} />
})
```

For custom transports with non-serializable functions or browser-only state,
create the adapter inside `connection$` or `fetcher$`:

```tsx
import { $, component$ } from '@qwik.dev/core'
import { useChat } from '@tanstack/ai-qwik'

export default component$(() => {
  const chat = useChat({
    connection$: $(() => ({
      async *connect() {
        // Create or call browser-only transport code here.
      },
    })),
  })

  return <button onClick$={() => chat.sendMessage('Use custom transport')} />
})
```

The same serialization rule applies to persistence adapters and custom chunk
strategies because both contain methods. Create them with `persistence$` and
`streamProcessor$` in SSR/resumable applications:

```tsx
import { $, component$ } from '@qwik.dev/core'
import { BatchStrategy } from '@tanstack/ai'
import { useChat } from '@tanstack/ai-qwik'

export default component$(() => {
  const chat = useChat({
    api: '/api/chat',
    persistence$: $(() => ({
      getItem: (id) => JSON.parse(localStorage.getItem(id) || 'null'),
      setItem: (id, messages) =>
        localStorage.setItem(id, JSON.stringify(messages)),
      removeItem: (id) => localStorage.removeItem(id),
    })),
    streamProcessor$: $(() => ({
      chunkStrategy: new BatchStrategy(5),
    })),
  })

  return <button onClick$={() => chat.sendMessage('Hello')} />
})
```

Direct `connection`, `fetcher`, `tools`, `persistence`, `streamProcessor`, and
callback options remain available for client-only rendering. For SSR, prefer
their `$` variants: Qwik intentionally drops values marked with `noSerialize()`
when the server-rendered application resumes in the browser.
