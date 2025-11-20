import { createFileRoute } from "@tanstack/react-router";
import { ai, toStreamResponse, maxIterations } from "@tanstack/ai";
import { stubAdapter } from "@/lib/stub-adapter";
import { allTools } from "@/lib/guitar-tools";
import { openai } from "@tanstack/ai-openai";

export const Route = createFileRoute("/api/test-chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Create AI instance with stub adapter (no token usage!)
        const aiInstance = ai(openai());

        const { messages } = await request.json();

        try {
          const stream = aiInstance.chat({
            messages,
            model: "gpt-4.1-nano", // Doesn't matter for stub
            tools: allTools,
            systemPrompts: [],
            options:
            {
              temperature: 0.7,
              topP: 1,
              frequencyPenalty: 0,
              presencePenalty: 0,
              maxTokens: 1000,
              stream: true,
              "seed": 331423424,
            },
            agentLoopStrategy: maxIterations(20),
            providerOptions: {},
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
