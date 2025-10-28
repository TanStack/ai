import { createFileRoute } from "@tanstack/react-router";
import { AI, tool } from "@tanstack/ai";
import { OllamaAdapter } from "@tanstack/ai-ollama";
import { OpenAIAdapter } from "@tanstack/ai-openai";
import { wrapExternalProvider } from "@tanstack/ai";
import guitars from "@/data/example-guitars";



const SYSTEM_PROMPT = `You are a helpful assistant for a store that sells guitars.

You can use the following tools to help the user:

- getGuitars: Get all guitars from the database
- recommendGuitar: Recommend a guitar to the user
`;

// Define tools with the exact Tool structure - no conversions under the hood!
const tools = {
  getGuitars: tool({
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
  }),
  recommendGuitar: tool({
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
  }),
}



import { createOpenAI, OpenAIResponsesProviderOptions } from "@ai-sdk/openai"

const openAi = createOpenAI({
  apiKey: process.env.AI_KEY!,
});

const vercelOpenAiAdapter = wrapExternalProvider<OpenAIResponsesProviderOptions>()(openAi);


// Initialize AI with tools and system prompts in constructor
const ai = new AI({
  adapters: {
    openAi: new OpenAIAdapter({
      apiKey: process.env.AI_KEY!,
    }),
    ollama: new OllamaAdapter({
      apiKey: process.env.AI_KEY!,
    }),
    // this works the same way as the adapters above because wrapper converted it to our convention
    externalOpenAi: vercelOpenAiAdapter,
  },
  fallbacks: [
    {
      adapter: "openAi",
      model: "gpt-4o-mini",
    },
    {
      adapter: "ollama",
      model: "gpt-oss:20b"
    }
  ],
  tools,
  systemPrompts: [SYSTEM_PROMPT],
});

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

        return ai.chat({
          model: "gpt-5",
          adapter: "externalOpenAi",
          as: "response",
          messages,
        });
      },
    },
  },
});
