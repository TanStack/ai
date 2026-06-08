# @tanstack/ai-svelte

Svelte bindings for TanStack AI.

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
  import { createChat, fetchServerSentEvents } from '@tanstack/ai-svelte'

  const chat = createChat({
    connection: fetchServerSentEvents('/api/chat'),
  })
</script>

<div>
  {#each chat.messages as message}
    <div>{message.role}: {message.parts[0].content}</div>
  {/each}

  {#if chat.isLoading}
    <button onclick={chat.stop}>Stop</button>
  {/if}

  <button onclick={() => chat.sendMessage('Hello!')}> Send </button>
</div>
```

## API

### `createChat(options)`

Creates a reactive chat instance. Returns an object with reactive getters and methods:

**Reactive Properties (no `$` prefix needed):**

- `messages` - Array of messages in the conversation
- `isLoading` - Boolean indicating if a response is being generated
- `error` - Current error, if any

**Methods:**

- `sendMessage(content)` - Send a message
- `append(message)` - Append a message
- `reload()` - Reload the last assistant message
- `stop()` - Stop the current response generation
- `clear()` - Clear all messages
- `setMessages(messages)` - Set messages manually
- `addToolResult(result)` - Add a tool result
- `addToolApprovalResponse(response)` - Respond to a tool approval request

## Svelte 5 Runes

This library uses Svelte 5 runes (`$state`) internally, providing a clean API where you don't need to use the `$` prefix to access reactive state:

```svelte
<script>
  const chat = createChat({})

  // No $ needed - these are reactive getters!
  console.log(chat.messages)
  console.log(chat.isLoading)
</script>

<!-- Reactivity works automatically in templates -->
{#each chat.messages as message}
  ...
{/each}
```

## License

MIT
