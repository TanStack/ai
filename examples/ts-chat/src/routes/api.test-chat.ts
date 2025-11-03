import { createFileRoute } from "@tanstack/react-router";
import { ai, toStreamResponse, maxIterations } from "@tanstack/ai";
import { stubAdapter } from "@/lib/stub-adapter";
import { allTools } from "@/lib/guitar-tools";

export const Route = createFileRoute("/api/test-chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Create AI instance with stub adapter (no token usage!)
        const aiInstance = ai(stubAdapter());

        const { messages } = await request.json();

        try {
          const stream = aiInstance.chat({
            messages,
            model: "stub-llm", // Doesn't matter for stub
            tools: allTools,
            systemPrompts: [],
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
