# @tanstack/ai-react-ui

Headless React components for building AI chat interfaces with TanStack AI SDK.

## Features

🧩 **Parts-Based Messages** - Native support for TanStack AI's message parts (text, thinking, tool calls, results)  
💭 **Thinking/Reasoning** - Collapsible thinking sections that auto-collapse when complete  
🔐 **Tool Approvals** - Built-in UI for tools that require user approval  
💻 **Client-Side Tools** - Execute tools in the browser without server round-trips  
🎨 **Headless & Customizable** - Fully unstyled with render props for complete control  
⚡ **Type-Safe** - Full TypeScript support with proper inference

## Installation

```bash
pnpm add @tanstack/ai-react-ui
```

## Quick Start

```tsx
import { Chat } from '@tanstack/ai-react-ui'
import { fetchServerSentEvents } from '@tanstack/ai-react'

function MyChat() {
  return (
    <Chat connection={fetchServerSentEvents('/api/chat')}>
      <Chat.Messages>
        {(message) => <Chat.Message message={message} />}
      </Chat.Messages>
      <Chat.Input placeholder="Type a message..." />
    </Chat>
  )
}
```

## Core Concepts

### Parts-Based Messages

Unlike traditional chat libraries that treat messages as simple strings, TanStack AI uses **parts**:

```typescript
{
  role: "assistant",
  parts: [
    {
      type: "thinking",
      content: "The user wants a guitar recommendation..."
    },
    { type: "text", content: "Here's a recommendation:" },
    {
      type: "tool-call",
      name: "recommendGuitar",
      arguments: '{"id":"6"}',
      state: "input-complete"
    }
  ]
}
```

This allows:

- Multiple content types in one message (thinking, text, tool calls, results)
- Proper streaming of thinking/reasoning alongside text
- Collapsible thinking sections that auto-collapse when complete
- Proper streaming of tool calls alongside text
- State tracking for each part independently

### Tool Approvals

Tools can require user approval before execution:

```tsx
<Chat
  onToolCall={async ({ toolName, input }) => {
    // Client-side tool execution
    if (toolName === 'addToWishList') {
      const wishList = JSON.parse(localStorage.getItem('wishList') || '[]')
      wishList.push(input.guitarId)
      localStorage.setItem('wishList', JSON.stringify(wishList))
      return { success: true }
    }
  }}
>
  <Chat.Messages>
    {(message) => (
      <Chat.Message
        message={message}
        partRenderers={{
          toolCall: ({ approval, ...props }) =>
            approval?.needsApproval ? (
              <Chat.ToolApproval {...props} approval={approval} />
            ) : null,
        }}
      />
    )}
  </Chat.Messages>
</Chat>
```

## API Reference

### `<Chat>`

Root component that provides chat context to all subcomponents.

**Props:**

- `connection: ConnectionAdapter` - How to connect to your API
- `onToolCall?: (args) => Promise<any>` - Handler for client-side tools
- `className?: string` - CSS class for root element
- All other `useChat` options

### `<Chat.Messages>`

Renders the list of messages.

**Props:**

- `children?: (message, index) => ReactNode` - Custom message renderer
- `emptyState?: ReactNode` - Show when no messages
- `loadingState?: ReactNode` - Show while loading
- `autoScroll?: boolean` - Auto-scroll to bottom (default: true)

### `<Chat.Message>`

Renders a single message with all its parts.

**Props:**

- `message: UIMessage` - The message to render
- `textPartRenderer?: (props: { content: string }) => ReactNode` - Custom renderer for text parts
- `thinkingPartRenderer?: (props: { content: string; isComplete?: boolean }) => ReactNode` - Custom renderer for thinking parts
- `toolsRenderer?: Record<string, (props) => ReactNode>` - Named tool renderers
- `defaultToolRenderer?: (props) => ReactNode` - Default tool renderer
- `toolResultRenderer?: (props) => ReactNode` - Custom renderer for tool results

### `<Chat.Input>`

Auto-growing textarea input.

**Props:**

- `children?: (renderProps) => ReactNode` - Render prop for full control
- `placeholder?: string`
- `autoGrow?: boolean` - Auto-grow textarea (default: true)
- `maxHeight?: number` - Max height in pixels (default: 200)
- `submitOnEnter?: boolean` - Submit on Enter, new line on Shift+Enter (default: true)

### `<Chat.ToolApproval>`

Renders approve/deny buttons for tools requiring approval.

**Props:**

- `toolCallId: string`
- `toolName: string`
- `input: any` - Parsed tool arguments
- `approval: { id, needsApproval, approved? }`
- `children?: (renderProps) => ReactNode` - Custom approval UI

## Examples

### Custom Message Styling

```tsx
<Chat.Message
  message={message}
  textPartRenderer={({ content }) => (
    <div className="bg-blue-500 text-white p-4 rounded">
      <ReactMarkdown>{content}</ReactMarkdown>
    </div>
  )}
  thinkingPartRenderer={({ content, isComplete }) => (
    <div className="bg-purple-500/20 p-4 rounded border border-purple-500/50">
      <details open={!isComplete}>
        <summary className="cursor-pointer">💭 Thinking...</summary>
        <pre className="mt-2 text-sm">{content}</pre>
      </details>
    </div>
  )}
  toolsRenderer={{
    recommendGuitar: ({ name, state }) => (
      <div className="bg-gray-200 p-2 rounded">
        Tool: {name} ({state})
      </div>
    ),
  }}
/>
```

### Custom Input with Send Button

```tsx
<Chat.Input>
  {({ value, onChange, onSubmit, isLoading, inputRef }) => (
    <div className="flex gap-2">
      <textarea
        ref={inputRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="flex-1 border rounded p-2"
      />
      <button
        onClick={onSubmit}
        disabled={isLoading}
        className="px-4 py-2 bg-blue-500 text-white rounded"
      >
        Send
      </button>
    </div>
  )}
</Chat.Input>
```

### Custom Approval Flow

```tsx
<Chat.ToolApproval
  toolCallId={part.id}
  toolName={part.name}
  input={JSON.parse(part.arguments)}
  approval={part.approval}
>
  {({ toolName, input, onApprove, onDeny }) => (
    <div className="approval-dialog">
      <h3>Confirm: {toolName}</h3>
      <pre>{JSON.stringify(input, null, 2)}</pre>
      <button onClick={onApprove}>Yes</button>
      <button onClick={onDeny}>No</button>
    </div>
  )}
</Chat.ToolApproval>
```

## Comparison with Other Libraries

### Vercel AI SDK

```tsx
// Vercel: String-based messages, limited customization
const { messages } = useChat({
  api: '/api/chat',
})

// Messages are simple strings - no parts, no states
messages.map((m) => <div>{m.content}</div>)
```

### TanStack AI

```tsx
// TanStack: Parts-based with full control
const { messages } = useChat({
  connection: fetchServerSentEvents('/api/chat'),
  onToolCall: async ({ toolName, input }) => {
    // Client-side execution!
    return executeLocally(toolName, input)
  },
})

// Messages have typed parts with states
messages.map((m) => (
  <Chat.Message
    message={m}
    partRenderers={{
      toolCall: (props) =>
        props.approval ? (
          <Chat.ToolApproval {...props} />
        ) : (
          <ToolDisplay {...props} />
        ),
    }}
  />
))
```

## License

MIT
