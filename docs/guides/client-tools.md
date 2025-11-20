# Client Tools

Client tools execute in the browser, allowing you to interact with the UI, local storage, and browser APIs.

## Defining Client Tools

Client tools are defined on the server (so the model knows about them) but executed on the client. They don't have an `execute` function in the server definition:

```typescript
// Server: tools.ts
import { tool } from "@tanstack/ai";
import { z } from "zod";

// Client tool - no execute function (executes on client)
export const updateUI = tool({
  description: "Update the UI with new information",
  inputSchema: z.object({
    message: z.string().describe("Message to display"),
    type: z.enum(["success", "error", "info"]).describe("Message type"),
  }),
  // No execute - will be handled on client
});

export const saveToLocalStorage = tool({
  description: "Save data to browser local storage",
  inputSchema: z.object({
    key: z.string().describe("Storage key"),
    value: z.string().describe("Value to store"),
  }),
  // No execute - will be handled on client
});
```

## Using Client Tools

### Server-Side

Pass client tools to the chat (they won't execute on the server):

```typescript
import { ai, toStreamResponse } from "@tanstack/ai";
import { openai } from "@tanstack/ai-openai";
import { updateUI, saveToLocalStorage } from "./tools";

const aiInstance = ai(openai());

export async function POST(request: Request) {
  const { messages } = await request.json();

  const stream = aiInstance.chat({
    messages,
    model: "gpt-4o",
    tools: [updateUI, saveToLocalStorage], // Model knows about these tools
  });

  return toStreamResponse(stream);
}
```

### Client-Side

Handle tool execution in the `onToolCall` callback:

```typescript
import { useChat, fetchServerSentEvents } from "@tanstack/ai-react";

function ChatComponent() {
  const { messages, sendMessage, isLoading } = useChat({
    connection: fetchServerSentEvents("/api/chat"),
    onToolCall: async ({ toolName, input }) => {
      // Handle client-side tool execution
      switch (toolName) {
        case "updateUI":
          // Update React state, show toast, etc.
          setNotification({ message: input.message, type: input.type });
          return { success: true };

        case "saveToLocalStorage":
          localStorage.setItem(input.key, input.value);
          return { saved: true };

        default:
          throw new Error(`Unknown client tool: ${toolName}`);
      }
    },
  });

  // ... rest of component
}
```

## Tool States

Client tools go through different states that you can observe:

```typescript
const { messages } = useChat({
  connection: fetchServerSentEvents("/api/chat"),
  onToolCall: async ({ toolName, input }) => {
    // Tool is in "executing" state
    // Execute the tool
    const result = await executeTool(toolName, input);
    // Tool moves to "output-available" state
    return result;
  },
});

// In your UI, you can check tool states:
messages.forEach((message) => {
  message.parts.forEach((part) => {
    if (part.type === "tool-call") {
      if (part.state === "executing") {
        // Show loading indicator
      } else if (part.state === "output-available") {
        // Show success
      } else if (part.state === "output-error") {
        // Show error
      }
    }
  });
});
```

## Hybrid Tools (Server + Client)

Some tools might need both server and client execution:

```typescript
// Server: Fetch data
const fetchUserPreferences = tool({
  description: "Get user preferences from server",
  inputSchema: z.object({
    userId: z.string(),
  }),
  execute: async ({ userId }) => {
    // Server execution
    const prefs = await db.userPreferences.findUnique({ where: { userId } });
    return prefs;
  },
});

// Client: Display preferences in UI
const displayPreferences = tool({
  description: "Display user preferences in the UI",
  inputSchema: z.object({
    preferences: z.any(),
  }),
  // Client execution only
});
```

## Best Practices

1. **Keep client tools simple** - They run in the browser, so avoid heavy computations
2. **Handle errors** - Return meaningful error messages
3. **Update UI reactively** - Use React state updates for UI changes
4. **Secure sensitive data** - Never store sensitive data in local storage
5. **Provide feedback** - Show loading states and success/error messages

## Common Use Cases

- **UI Updates** - Show notifications, update forms, toggle visibility
- **Local Storage** - Save user preferences, cache data
- **Browser APIs** - Access geolocation, camera, clipboard
- **State Management** - Update React/Vue/Solid state
- **Navigation** - Change routes, scroll to sections

## Next Steps

- [Server Tools](./server-tools) - Learn about server-side tool execution
- [Tool Approval Flow](./tool-approval) - Add approval workflows for sensitive client operations

