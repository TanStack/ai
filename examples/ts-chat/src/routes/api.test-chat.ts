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

        // Extract approvals and client tool results from messages
        const approvals = new Map<string, boolean>();
        const clientToolResults = new Map<string, any>();

        // Look for approval responses and client tool outputs in the last assistant message
        const lastMessage = messages[messages.length - 1];
        if (lastMessage?.role === "assistant" && lastMessage.parts) {
          for (const part of lastMessage.parts) {
            // Handle approval responses
            if (
              part.type === "tool-call" &&
              part.state === "approval-responded" &&
              part.approval
            ) {
              approvals.set(part.approval.id, part.approval.approved);
            }

            // Handle client tool outputs
            if (
              part.type === "tool-call" &&
              part.output !== undefined &&
              !part.approval
            ) {
              clientToolResults.set(part.id, part.output);
            }
          }
        }

        try {
          const stream = aiInstance.chat({
            messages,
            model: "stub-llm", // Doesn't matter for stub
            tools: allTools,
            systemPrompts: [],
            agentLoopStrategy: maxIterations(20),
            approvals,
            clientToolResults,
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
