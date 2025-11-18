# Tools

Tools (also called "function calling") allow AI models to interact with external systems, APIs, or perform computations. TanStack AI supports both server-side and client-side tool execution.

## Overview

Tools enable your AI application to:
- **Fetch data** from APIs or databases
- **Perform calculations** or data transformations
- **Interact with services** like email, calendars, or payment systems
- **Execute client-side operations** like updating UI or local storage

## Tool Types

### Server Tools
Tools that execute on the server. These are secure and can access:
- Databases
- External APIs
- File systems
- Environment variables
- Server-only resources

### Client Tools
Tools that execute in the browser. These are useful for:
- UI updates
- Local storage operations
- Browser APIs
- Client-side state management

## Basic Tool Definition

Tools are defined using the `tool` utility from `@tanstack/ai`:

```typescript
import { tool } from "@tanstack/ai";
import { z } from "zod";

const getWeather = tool({
  description: "Get the current weather for a location",
  inputSchema: z.object({
    location: z.string().describe("The city and state, e.g. San Francisco, CA"),
    unit: z.enum(["celsius", "fahrenheit"]).optional(),
  }),
  execute: async ({ location, unit }) => {
    // Fetch weather data
    const response = await fetch(
      `https://api.weather.com/v1/current?location=${location}&unit=${unit || "fahrenheit"}`
    );
    const data = await response.json();
    return {
      temperature: data.temperature,
      conditions: data.conditions,
      location: data.location,
    };
  },
});
```

## Using Tools in Chat

### Server-Side

```typescript
import { ai, toStreamResponse } from "@tanstack/ai";
import { openai } from "@tanstack/ai-openai";
import { getWeather } from "./tools";

const aiInstance = ai(openai());

export async function POST(request: Request) {
  const { messages } = await request.json();

  const stream = aiInstance.chat({
    messages,
    model: "gpt-4o",
    tools: [getWeather], // Pass tools array
  });

  return toStreamResponse(stream);
}
```

### Client-Side

```typescript
import { useChat, fetchServerSentEvents } from "@tanstack/ai-react";

const { messages, sendMessage } = useChat({
  connection: fetchServerSentEvents("/api/chat"),
  onToolCall: async ({ toolName, input }) => {
    // Handle client-side tool execution
    switch (toolName) {
      case "updateUI":
        // Update UI state
        return { success: true };
      case "saveToLocalStorage":
        localStorage.setItem("data", JSON.stringify(input));
        return { saved: true };
      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
  },
});
```

## Tool Execution Flow

1. **Model decides to call a tool** - Based on user input and tool descriptions
2. **Tool is identified** - Server or client tool
3. **Tool executes** - With the provided arguments
4. **Result is returned** - To the model as a tool result message
5. **Model continues** - Uses the result to generate a response

## Tool States

Tools go through different states during execution:

- `pending` - Tool call has been made, waiting for execution
- `executing` - Tool is currently executing
- `output-available` - Tool execution completed successfully
- `output-error` - Tool execution failed
- `approval-requested` - Tool requires user approval before execution

## Next Steps

- [Server Tools](./server-tools) - Learn about server-side tool execution
- [Client Tools](./client-tools) - Learn about client-side tool execution
- [Tool Approval Flow](./tool-approval) - Implement approval workflows

