import { createFileRoute } from "@tanstack/react-router";
import {
  chat,
  toStreamResponse,
  maxIterations,
} from "@tanstack/ai";
import { openai } from "@tanstack/ai-openai";
// import { ollama } from "@tanstack/ai-ollama";
// import { anthropic } from "@tanstack/ai-anthropic";
// import { gemini } from "@tanstack/ai-gemini";
import { allTools } from "@/lib/guitar-tools";

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

export const Route = createFileRoute("/api/tanchat")({
  server: {
    handlers: {
      POST: async ({ request }) => {


        // Capture request signal before reading body (it may be aborted after body is consumed)
        const requestSignal = request.signal;

        // If request is already aborted, return early
        if (requestSignal?.aborted) {
          return new Response(null, { status: 499 }); // 499 = Client Closed Request
        }

        const abortController = new AbortController();

        const { messages } = await request.json();
        try {
          // Use the stream abort signal for proper cancellation handling
          const stream = chat({
            adapter: openai(),
            // For thinking/reasoning support, use one of these models:
            // - OpenAI: "gpt-5", "o3", "o3-pro", "o3-mini" (with reasoning option)
            // - Anthropic: "claude-sonnet-4-5-20250929", "claude-opus-4-5-20251101" (with thinking option)
            // - Gemini: "gemini-3-pro-preview", "gemini-2.5-pro" (with thinkingConfig option)
            model: "gpt-5",
            // model: "claude-sonnet-4-5-20250929",
            // model: "smollm",
            // model: "gemini-2.5-flash",
            tools: allTools,
            systemPrompts: [SYSTEM_PROMPT],
            agentLoopStrategy: maxIterations(20),
            messages,
            providerOptions: {
              // Enable reasoning for OpenAI (gpt-5, o3 models):
              // reasoning: {
              //   effort: "medium", // or "low", "high", "minimal", "none" (for gpt-5.1)
              // },
              // Enable thinking for Anthropic:
              /*   thinking: {
                  type: "enabled",
                  budget_tokens: 2048,
                }, */
            },
            abortController,
          });

          return toStreamResponse(stream, { abortController });
        } catch (error: any) {
          console.error("[API Route] Error in chat request:", {
            message: error?.message,
            name: error?.name,
            status: error?.status,
            statusText: error?.statusText,
            code: error?.code,
            type: error?.type,
            stack: error?.stack,
            error: error,
          });
          // If request was aborted, return early (don't send error response)
          if (error.name === "AbortError" || abortController.signal.aborted) {
            return new Response(null, { status: 499 }); // 499 = Client Closed Request
          }
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
