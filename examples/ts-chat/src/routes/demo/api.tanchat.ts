import { createFileRoute } from "@tanstack/react-router";
import { ai, tool, toStreamResponse, maxIterations } from "@tanstack/ai";
import { openai } from "@tanstack/ai-openai";
import guitars from "@/data/example-guitars";

const SYSTEM_PROMPT = `You are a helpful assistant for a store that sells guitars.

You can use the following tools to help the user:

- getGuitars: Get all guitars from the database
- recommendGuitar: Recommend a guitar to the user
`;

// Define tools with the exact Tool structure
const getGuitarsTool = tool({
  type: "function",
  function: {
    name: "getGuitars",
    description: "Get all products from the database",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  execute: async () => {
    return JSON.stringify(guitars);
  },
});

const recommendGuitarTool = tool({
  type: "function",
  function: {
    name: "recommendGuitar",
    description: "Use this tool to recommend a guitar to the user",
    parameters: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "The id of the guitar to recommend",
        },
        name: {
          type: "boolean",
          description: "Whether to include the name in the response",
        },
      },
      required: ["id"],
    },
  },
  execute: async (args) => {
    // ✅ args is automatically typed as { id: string; name?: boolean }
    return JSON.stringify({ id: args.id });
  },
});

export const Route = createFileRoute("/demo/api/tanchat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Create AI instance with single adapter
        const aiInstance = ai(openai());

        // Check for API key
        if (!process.env.OPENAI_API_KEY) {
          return new Response(
            JSON.stringify({
              error:
                "OPENAI_API_KEY not configured. Please add it to .env or .env.local",
            }),
            {
              status: 500,
              headers: { "Content-Type": "application/json" },
            }
          );
        }

        const { messages } = await request.json();

        try {
          // Use chat() with toStreamResponse() for HTTP streaming
          // Tools are automatically executed by the SDK in a loop
          const stream = aiInstance.chat({
            messages,
            model: "gpt-4o",
            tools: [getGuitarsTool, recommendGuitarTool],
            systemPrompts: [SYSTEM_PROMPT],
            agentLoopStrategy: maxIterations(5), // Control tool execution loop
            providerOptions: {
              store: true,
              parallelToolCalls: true,
            },
          });

          return toStreamResponse(stream);
        } catch (error: any) {
          return new Response(
            JSON.stringify({
              error: error.message || "An error occurred",
            }),
            {
              status: 500,
              headers: { "Content-Type": "application/json" },
            }
          );
        }
      },
    },
  },
});
