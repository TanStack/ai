import { createFileRoute } from "@tanstack/react-router";
import { ai, tool, toStreamResponse, maxIterations } from "@tanstack/ai";
import { openai } from "@tanstack/ai-openai";
import guitars from "@/data/example-guitars";

const SYSTEM_PROMPT = `You are a helpful assistant for a guitar store.

CRITICAL INSTRUCTIONS - YOU MUST FOLLOW THIS EXACT WORKFLOW:

When a user asks for a guitar recommendation:
1. FIRST: Use the getGuitars tool (no parameters needed)
2. SECOND: Use the recommendGuitar tool with the ID of the guitar you want to recommend
3. NEVER write a recommendation directly - ALWAYS use the recommendGuitar tool

IMPORTANT:
- The recommendGuitar tool will display the guitar in a special, appealing format
- You MUST use recommendGuitar for ANY guitar recommendation
- ONLY recommend guitars from our inventory (use getGuitars first)
- The recommendGuitar tool has a buy button - this is how customers purchase
- Do NOT describe the guitar yourself - let the recommendGuitar tool do it

Example workflow:
User: "I want an acoustic guitar"
Step 1: Call getGuitars()
Step 2: Call recommendGuitar(id: "6") 
Step 3: Done - do NOT add any text after calling recommendGuitar
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
    description:
      "REQUIRED tool to display a guitar recommendation to the user. This tool MUST be used whenever recommending a guitar - do NOT write recommendations yourself. This displays the guitar in a special appealing format with a buy button.",
    parameters: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description:
            "The ID of the guitar to recommend (from the getGuitars results)",
        },
      },
      required: ["id"],
    },
  },
  execute: async (args) => {
    return JSON.stringify({ id: args.id });
  },
});

export const Route = createFileRoute("/api/tanchat")({
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
          const stream = aiInstance.chat({
            messages,
            model: "gpt-4o",
            tools: [getGuitarsTool, recommendGuitarTool],
            systemPrompts: [SYSTEM_PROMPT],
            agentLoopStrategy: maxIterations(20),
            providerOptions: {
              store: true,
              parallelToolCalls: false, // Force sequential tool calls
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
