# Tool States and Parts-Based Messages - Migration Guide

## Overview

This migration introduces comprehensive tool state tracking and a parts-based message structure to improve UI rendering and tool handling during streaming.

## Key Changes

### 1. Message Type Renamed: `Message` → `ModelMessage`

**Package:** `@tanstack/ai`

The `Message` interface has been renamed to `ModelMessage` to better reflect its purpose as the format used for LLM communication.

**Before:**
```typescript
import type { Message } from "@tanstack/ai";
const messages: Message[] = [];
```

**After:**
```typescript
import type { ModelMessage } from "@tanstack/ai";
const messages: ModelMessage[] = [];
```

### 2. New UIMessage Type with Parts

**Package:** `@tanstack/ai-client`

A new `UIMessage` type has been introduced for client-side UI rendering. Messages are now composed of parts (text, tool calls, tool results) instead of flat content and toolCalls properties.

**Structure:**
```typescript
interface UIMessage {
  id: string;
  role: "system" | "user" | "assistant";
  parts: MessagePart[];
  createdAt?: Date;
}

type MessagePart = TextPart | ToolCallPart | ToolResultPart;

interface TextPart {
  type: "text";
  content: string;
}

interface ToolCallPart {
  type: "tool-call";
  id: string;
  name: string;
  arguments: string;
  state: ToolCallState; // "awaiting-input" | "input-streaming" | "input-complete"
}

interface ToolResultPart {
  type: "tool-result";
  toolCallId: string;
  content: string;
  state: ToolResultState; // "streaming" | "complete" | "error"
  error?: string;
}
```

### 3. Tool Call States

Tool calls now track their lifecycle:
- **awaiting-input**: Tool call started but no arguments received yet
- **input-streaming**: Partial arguments received (uses loose JSON parser)
- **input-complete**: All arguments received

### 4. Partial JSON Parsing

A new loose JSON parser has been integrated to handle incomplete tool arguments during streaming:

```typescript
import { parsePartialJSON } from "@tanstack/ai-client";

const partialArgs = '{"name": "John", "ag';
const parsed = parsePartialJSON(partialArgs); // { name: "John" }
```

### 5. Automatic Conversion

Connection adapters automatically convert `UIMessage[]` to `ModelMessage[]` before sending to the server:

```typescript
// Client code - works with UIMessages
const messages: UIMessage[] = [
  {
    id: "1",
    role: "user",
    parts: [{ type: "text", content: "Hello" }]
  }
];

// Automatically converted to ModelMessages when sent
const connection = fetchServerSentEvents("/api/chat");
const stream = connection.connect(messages); // Converts internally
```

## Migration Steps

### For CLI/Backend Code (using @tanstack/ai)

**Step 1:** Update type imports
```diff
- import type { Message } from "@tanstack/ai";
+ import type { ModelMessage } from "@tanstack/ai";
```

**Step 2:** Update variable types
```diff
- const messages: Message[] = [];
+ const messages: ModelMessage[] = [];
```

### For React/Client Code (using @tanstack/ai-client or @tanstack/ai-react)

**Step 1:** Update message rendering to use parts

**Before:**
```typescript
{messages.map(({ id, role, content, toolCalls }) => (
  <div key={id}>
    {content && <p>{content}</p>}
    {toolCalls?.map(tc => <ToolCallUI {...tc} />)}
  </div>
))}
```

**After:**
```typescript
{messages.map(({ id, role, parts }) => {
  const textContent = parts
    .filter(p => p.type === "text")
    .map(p => p.content)
    .join("");
  
  const toolCallParts = parts.filter(p => p.type === "tool-call");
  
  return (
    <div key={id}>
      {textContent && <p>{textContent}</p>}
      {toolCallParts.map(tc => <ToolCallUI {...tc} />)}
    </div>
  );
})}
```

**Step 2:** Access tool call state
```typescript
{toolCallParts.map(tc => (
  <div key={tc.id}>
    <span>{tc.name}</span>
    {tc.state === "input-streaming" && <Spinner />}
    {tc.state === "input-complete" && <CheckIcon />}
  </div>
))}
```

### For Server Code (Python/PHP)

**No changes required!** Servers receive ModelMessages (the same structure as before), so existing server code continues to work without modification.

## New Features Available

### 1. Tool State Tracking

Monitor tool call progress in real-time:

```typescript
const processor = new StreamProcessor({
  handlers: {
    onToolCallStateChange: (index, id, name, state, args, parsedArgs) => {
      console.log(`Tool ${name} is now ${state}`);
      if (parsedArgs) {
        console.log("Parsed arguments so far:", parsedArgs);
      }
    }
  }
});
```

### 2. Message Converters

Convert between UIMessages and ModelMessages:

```typescript
import {
  uiMessageToModelMessages,
  modelMessageToUIMessage,
  modelMessagesToUIMessages
} from "@tanstack/ai-client";

// Convert UI message to model message(s)
const modelMessages = uiMessageToModelMessages(uiMessage);

// Convert model message to UI message
const uiMessage = modelMessageToUIMessage(modelMessage, "msg-123");

// Convert array of model messages to UI messages
const uiMessages = modelMessagesToUIMessages(modelMessages);
```

### 3. Custom JSON Parser

Provide your own parser for incomplete JSON:

```typescript
const customParser = {
  parse: (jsonString: string) => {
    // Your custom parsing logic
    return myPartialJSONParser(jsonString);
  }
};

const processor = new StreamProcessor({
  jsonParser: customParser,
  handlers: { /* ... */ }
});
```

## Updated Exports

### @tanstack/ai
- ✅ `ModelMessage` (renamed from `Message`)
- All other exports unchanged

### @tanstack/ai-client
- ✅ `UIMessage` - New parts-based message type
- ✅ `MessagePart`, `TextPart`, `ToolCallPart`, `ToolResultPart` - Part types
- ✅ `ToolCallState`, `ToolResultState` - State types
- ✅ `uiMessageToModelMessages`, `modelMessageToUIMessage`, `modelMessagesToUIMessages` - Converters
- ✅ `parsePartialJSON`, `PartialJSONParser`, `JSONParser` - JSON parsing utilities
- ✅ `UIMessage` - Domain-specific message format optimized for building chat UIs

## Breaking Changes

### ❗️ Message Type Rename
- `Message` is now `ModelMessage` in `@tanstack/ai`
- Update all type imports and variable declarations

### ❗️ UIMessage Structure Change
- Messages now have `parts: MessagePart[]` instead of `content` and `toolCalls`
- Update UI rendering code to iterate over parts
- Access text via `parts.filter(p => p.type === "text")`
- Access tool calls via `parts.filter(p => p.type === "tool-call")`

### ✅ No Breaking Changes For
- Server-side code (Python, PHP) - continues to work as-is
- Connection adapters - automatically convert UIMessages to ModelMessages
- Core AI functionality - ModelMessage has same structure as old Message

## Benefits

1. **Better UI State Management**: Track tool call progress in real-time
2. **Partial JSON Parsing**: Handle incomplete tool arguments during streaming
3. **Cleaner Domain Separation**: UIMessages for UI, ModelMessages for LLMs
4. **Tool Result Integration**: Tool results are now parts of the message stream
5. **Enhanced Developer Experience**: Clear state transitions and type safety

## Examples

See the updated examples:
- **CLI Example**: `/examples/cli/src/index.ts` - Uses ModelMessage
- **React Chat Example**: `/examples/ts-chat/src/routes/demo/tanchat.tsx` - Uses UIMessage with parts
- **AI Assistant Component**: `/examples/ts-chat/src/components/example-AIAssistant.tsx` - Uses UIMessage with parts

## Support

For questions or issues related to this migration, please refer to the TanStack AI documentation or open an issue on GitHub.

