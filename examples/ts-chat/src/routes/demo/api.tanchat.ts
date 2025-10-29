import { createFileRoute } from "@tanstack/react-router";
import { ai, tool, chat, responseFormat } from "@tanstack/ai";
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
  messages: [],
  adapter: openai(), // Type inference starts here
  model: "gpt-4o",
  as: "promise",
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
  output: guitarSchema,
  providerOptions: {
    webSearchOptions: {
      enabled: false,

    }
  }
});

// ✅ res.data is now properly typed with autocomplete!
// res.data.id (string)
// res.data.name (string)
// res.data.price (number)


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

// Create AI instance with single adapter
const aiInstance = ai(openai());



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
          messages,
          as: "response",
          model: "gpt-4o",
          tools: [getGuitarsTool, recommendGuitarTool],
          systemPrompts: [SYSTEM_PROMPT],
          providerOptions: {
            store: true,
            parallelToolCalls: true,
          }
        });
        return response;
      },
    },
  },
});
