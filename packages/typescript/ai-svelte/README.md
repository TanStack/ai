# @tanstack/ai-svelte

Svelte hooks for TanStack AI.

## Installation

```bash
npm install @tanstack/ai-svelte
# or
pnpm add @tanstack/ai-svelte
# or
yarn add @tanstack/ai-svelte
```

## Usage

```svelte
<script>
  import { useChat, fetchServerSentEvents } from '@tanstack/ai-svelte'

  const chat = useChat({
    connection: fetchServerSentEvents('/api/chat'),
  })
</script>

<div>
  {#each chat.messages as message}
    <div>{message.role}: {message.content}</div>
  {/each}

  {#if chat.isLoading}
    <button onclick={chat.stop}>Stop</button>
  {/if}

  <input
    type="text"
    onsubmit={(e) => {
      e.preventDefault()
      chat.sendMessage(e.target.value)
    }}
  />
</div>
```

## API

### `useChat(options)`

Returns a chat object with the following properties and methods:

- `messages` - Reactive array of messages
- `isLoading` - Reactive boolean indicating if a response is being generated
- `error` - Reactive error object
- `sendMessage(content)` - Send a message
- `append(message)` - Append a message
- `reload()` - Reload the last assistant message
- `stop()` - Stop the current response generation
- `clear()` - Clear all messages
- `setMessages(messages)` - Set messages manually
- `addToolResult(result)` - Add a tool result
- `addToolApprovalResponse(response)` - Respond to a tool approval request

## License

MIT

