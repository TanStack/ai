import { createFileRoute } from "@tanstack/react-router";
import { ai, tool, chat, responseFormat, } from "@tanstack/ai";
import { openai } from "@tanstack/ai-openai";
import guitars from "@/data/example-guitars";

// Create a typed response format for guitar info
const guitarSchema = responseFormat({
  name: "guitar_info",
  schema: {
    type: "object",
    properties: {
      id: { type: "string" },
      name: { type: "string" },
      price: { type: "number" },
    },
    required: ["id", "name"],
    additionalProperties: false,
  } as const,
});

// Example of standalone function usage
await chat({
  adapter: openai(), // Type inference starts here
  model: "gpt-4o",
  messages: [],
  tools: [tool({
    type: "function",
    function: {
      name: "exampleTool",
      description: "An example tool",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
    execute: async () => {
      return "Example tool executed";
    },
  })],
  options: {
    responseFormat: guitarSchema,
  },
  providerOptions: {
    webSearchOptions: {
      enabled: false,
    }
  },
  as: "promise",
});

// ✅ res.data is now properly typed with autocomplete!
// res.data.id (string)
// res.data.name (string)
// res.data.price (number)

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
    return JSON.stringify({ id: args.name });
  },
});

// Create AI instance with single adapter
const aiInstance = ai(openai());


aiInstance.chat({
  model: "chatgpt-4o-latest",
  messages: [],
  tools: [getGuitarsTool]
})


export const Route = createFileRoute("/demo/api/tanchat")({
  loader: async () => {
    return {
      message: "TanChat API Route with Provider Options",
    };
  },
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { messages } = await request.json();

        const response = aiInstance.chat({
          model: "gpt-4o",
          messages,
          tools: [getGuitarsTool, recommendGuitarTool],
          options: {
            responseFormat: guitarSchema,
          },
          providerOptions: {
            store: true,
            parallelToolCalls: true,
            strictJsonSchema: true
          },
          as: "response",
        });

        return response;
      },
    },
  },
});
