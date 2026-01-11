<div align="center">
  <img src="./media/header_ai.png" >
</div>

<br />

<div align="center">
<a href="https://npmjs.com/package/@tanstack/ai" target="\_parent">
  <img alt="" src="https://img.shields.io/npm/dm/@tanstack/ai.svg" />
</a>
<a href="https://github.com/TanStack/ai" target="\_parent">
	  <img alt="" src="https://img.shields.io/github/stars/TanStack/ai.svg?style=social&label=Star" alt="GitHub stars" />
</a>
<a href="https://bundlephobia.com/result?p=@tanstack/ai@latest" target="\_parent">
  <img alt="" src="https://badgen.net/bundlephobia/minzip/@tanstack/ai@latest" />
</a>
</div>

<div align="center">
<a href="#badge">
  <img alt="semantic-release" src="https://img.shields.io/badge/%20%20%F0%9F%93%A6%F0%9F%9A%80-semantic--release-e10079.svg">
</a>
	<a href="#badge">
		<img src="https://img.shields.io/github/v/release/tanstack/ai" alt="Release"/>
	</a>
<a href="https://twitter.com/tan_stack">
  <img src="https://img.shields.io/twitter/follow/tan_stack.svg?style=social" alt="Follow @TanStack"/>
</a>
</div>

<div align="center">
  
### [Become a Sponsor!](https://github.com/sponsors/tannerlinsley/)
</div>

# TanStack AI Preact UI

Headless Preact components for building AI chat interfaces with TanStack AI.

## Features

- 🎨 **Headless components** - Full control over styling and markup
- 🔄 **Parts-based rendering** - Native support for text, tool calls, thinking, and tool results
- ⚡ **Streaming support** - Real-time message updates
- 🔧 **Tool approval workflows** - Built-in support for tool approval UI
- 📦 **Compound components** - Composable API with `<Chat>`, `<ChatMessages>`, `<ChatInput>`, etc.
- 🎯 **Type-safe** - Full TypeScript support
- 🎭 **Render props** - Customize any part of the UI
- 🪝 **Preact hooks** - Built on `@tanstack/ai-preact`

## Installation

```bash
npm install @tanstack/ai-preact-ui @tanstack/ai-preact
# or
pnpm add @tanstack/ai-preact-ui @tanstack/ai-preact
# or
yarn add @tanstack/ai-preact-ui @tanstack/ai-preact
```

## Quick Start

```tsx
import {
  Chat,
  ChatMessages,
  ChatInput,
  ChatMessage,
} from '@tanstack/ai-preact-ui'
import { fetchServerSentEvents } from '@tanstack/ai-client'

function App() {
  return (
    <Chat connection={fetchServerSentEvents('/api/chat')}>
      <ChatMessages>
        {(message) => <ChatMessage message={message} />}
      </ChatMessages>
      <ChatInput placeholder="Type your message..." />
    </Chat>
  )
}
```

## Components

### `<Chat>`

Root component that provides chat context to all child components.

```tsx
<Chat
  connection={fetchServerSentEvents('/api/chat')}
  initialMessages={[]}
  onFinish={(message) => console.log('Message complete:', message)}
>
  {/* child components */}
</Chat>
```

### `<ChatMessages>`

Container for rendering all messages in the conversation.

```tsx
<ChatMessages
  autoScroll={true}
  emptyState={<p>No messages yet. Start a conversation!</p>}
  loadingState={<p>Loading...</p>}
>
  {(message) => <ChatMessage message={message} />}
</ChatMessages>
```

### `<ChatMessage>`

Renders a single message with all its parts (text, thinking, tool calls, tool results).

```tsx
<ChatMessage
  message={message}
  className="mb-4"
  userClassName="text-blue-500"
  assistantClassName="text-gray-700"
/>
```

#### Custom Part Renderers

```tsx
<ChatMessage
  message={message}
  textPartRenderer={({ content }) => (
    <TextPart content={content} className="prose dark:prose-invert" />
  )}
  thinkingPartRenderer={({ content, isComplete }) => (
    <ThinkingPart
      content={content}
      isComplete={isComplete}
      className="bg-gray-100 dark:bg-gray-800"
    />
  )}
  toolsRenderer={{
    weatherLookup: ({ arguments: args, output }) => (
      <WeatherCard data={JSON.parse(args)} result={output} />
    ),
  }}
/>
```

### `<ChatInput>`

Input component for sending messages.

```tsx
<ChatInput placeholder="Type a message..." submitOnEnter={true} />
```

#### Custom Input UI

```tsx
<ChatInput>
  {({ value, onChange, onSubmit, isLoading }) => (
    <div className="flex gap-2">
      <input
        value={value}
        onInput={(e) => onChange(e.target.value)}
        className="flex-1 px-4 py-2 border rounded"
      />
      <button
        onClick={onSubmit}
        disabled={isLoading}
        className="px-6 py-2 bg-blue-500 text-white rounded"
      >
        {isLoading ? 'Sending...' : 'Send'}
      </button>
    </div>
  )}
</ChatInput>
```

### `<TextPart>`

Renders text content with markdown support and syntax highlighting.

````tsx
<TextPart
  content="Hello **world**! Here's some code:\n```js\nconsole.log('hi')\n```"
  role="assistant"
  className="prose dark:prose-invert"
/>
````

### `<ThinkingPart>`

Renders model thinking/reasoning content with collapsible UI.

```tsx
<ThinkingPart
  content="Let me think about this step by step..."
  isComplete={false}
  className="bg-gray-100 p-4 rounded"
/>
```

### `<ToolApproval>`

Renders approve/deny buttons for tools that require approval.

```tsx
<ToolApproval
  toolCallId={part.id}
  toolName={part.name}
  input={JSON.parse(part.arguments)}
  approval={part.approval}
/>
```

## Hooks

### `useChatContext()`

Access the chat context from any child component.

```tsx
import { useChatContext } from '@tanstack/ai-preact-ui'

function CustomComponent() {
  const { messages, isLoading, sendMessage } = useChatContext()

  return (
    <div>
      <p>Messages: {messages.length}</p>
      <p>Loading: {isLoading ? 'Yes' : 'No'}</p>
    </div>
  )
}
```

## Styling

All components are headless and use data attributes for styling:

```css
/* Message styling */
[data-message-role='user'] {
  background: #e3f2fd;
  text-align: right;
}

[data-message-role='assistant'] {
  background: #f5f5f5;
}

/* Part type styling */
[data-part-type='text'] {
  padding: 1rem;
}

[data-part-type='thinking'] {
  opacity: 0.8;
  font-style: italic;
}

[data-part-type='tool-call'] {
  border-left: 3px solid #2196f3;
  padding-left: 1rem;
}
```

## Advanced Usage

### Custom Tool Renderers

```tsx
const toolRenderers = {
  searchWeb: ({ arguments: args, output }) => (
    <SearchResults query={JSON.parse(args).query} results={output} />
  ),
  generateImage: ({ arguments: args, output }) => (
    <ImagePreview prompt={JSON.parse(args).prompt} url={output?.url} />
  ),
}

<ChatMessage message={message} toolsRenderer={toolRenderers} />
```

### Error Handling

```tsx
<ChatMessages
  errorState={({ error, reload }) => (
    <div className="error">
      <p>Error: {error.message}</p>
      <button onClick={reload}>Retry</button>
    </div>
  )}
/>
```

## Documentation

For full documentation, visit [https://tanstack.com/ai](https://tanstack.com/ai)

## License

MIT
