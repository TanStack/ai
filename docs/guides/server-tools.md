# Server Tools

Server tools execute on the backend, giving you secure access to databases, APIs, and server-only resources.

## Defining Server Tools

Server tools are defined using the `tool` utility and passed to the AI instance:

```typescript
import { tool } from "@tanstack/ai";
import { z } from "zod";

// Example: Database query tool
const getUserData = tool({
  description: "Get user information from the database",
  inputSchema: z.object({
    userId: z.string().describe("The user ID to look up"),
  }),
  execute: async ({ userId }) => {
    // This runs on the server - can access database, APIs, etc.
    const user = await db.users.findUnique({ where: { id: userId } });
    return {
      name: user.name,
      email: user.email,
      createdAt: user.createdAt,
    };
  },
});

// Example: API call tool
const searchProducts = tool({
  description: "Search for products in the catalog",
  inputSchema: z.object({
    query: z.string().describe("Search query"),
    limit: z.number().optional().describe("Maximum number of results"),
  }),
  execute: async ({ query, limit = 10 }) => {
    const response = await fetch(
      `https://api.example.com/products?q=${query}&limit=${limit}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.API_KEY}`, // Server-only access
        },
      }
    );
    return await response.json();
  },
});
```

## Using Server Tools

Pass tools to the `chat` method:

```typescript
import { ai, toStreamResponse } from "@tanstack/ai";
import { openai } from "@tanstack/ai-openai";
import { getUserData, searchProducts } from "./tools";

const aiInstance = ai(openai());

export async function POST(request: Request) {
  const { messages } = await request.json();

  const stream = aiInstance.chat({
    messages,
    model: "gpt-4o",
    tools: [getUserData, searchProducts],
  });

  return toStreamResponse(stream);
}
```

## Tool Registry Pattern

For better organization, you can define tools in a registry:

```typescript
// tools/index.ts
import { tool } from "@tanstack/ai";
import { z } from "zod";

export const tools = {
  getUserData: tool({
    description: "Get user information",
    inputSchema: z.object({
      userId: z.string(),
    }),
    execute: async ({ userId }) => {
      // Implementation
    },
  }),
  searchProducts: tool({
    description: "Search products",
    inputSchema: z.object({
      query: z.string(),
    }),
    execute: async ({ query }) => {
      // Implementation
    },
  }),
};

// api/chat/route.ts
import { tools } from "@/tools";

const stream = aiInstance.chat({
  messages,
  model: "gpt-4o",
  tools: Object.values(tools),
});
```

## Automatic Execution

Server tools are automatically executed when the model calls them. The SDK:

1. Receives the tool call from the model
2. Executes the tool's `execute` function
3. Adds the result to the conversation
4. Continues the chat with the tool result

You don't need to manually handle tool execution - it's automatic!

## Error Handling

Tools should handle errors gracefully:

```typescript
const getUserData = tool({
  description: "Get user information",
  inputSchema: z.object({
    userId: z.string(),
  }),
  execute: async ({ userId }) => {
    try {
      const user = await db.users.findUnique({ where: { id: userId } });
      if (!user) {
        return { error: "User not found" };
      }
      return { name: user.name, email: user.email };
    } catch (error) {
      return { error: "Failed to fetch user data" };
    }
  },
});
```

## Best Practices

1. **Keep tools focused** - Each tool should do one thing well
2. **Validate inputs** - Use Zod schemas to ensure type safety
3. **Handle errors** - Return meaningful error messages
4. **Use descriptions** - Clear descriptions help the model use tools correctly
5. **Secure sensitive operations** - Never expose API keys or secrets to the client

## Next Steps

- [Client Tools](./client-tools) - Learn about client-side tool execution
- [Tool Approval Flow](./tool-approval) - Add approval workflows for sensitive operations

