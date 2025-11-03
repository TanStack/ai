import { createFileRoute } from "@tanstack/react-router";
import {
  Chat,
  ChatMessages,
  ChatMessage,
  ChatInput,
  ToolApproval,
  TextPart,
} from "@tanstack/ai-react-ui";
import { fetchServerSentEvents } from "@tanstack/ai-client";

import GuitarRecommendation from "@/components/example-GuitarRecommendation";
import Approval from "@/components/Approval";

export const Route = createFileRoute("/demo")({
  component: DemoPage,
});

function DemoPage() {
  return (
    <div className="min-h-screen bg-linear-to-br from-gray-900 via-gray-900 to-gray-950 flex flex-col">
      {/* Header */}
      <div className="border-b border-orange-500/10 bg-gray-950/50 backdrop-blur-sm">
        <div className="max-w-5xl mx-auto px-6 py-8">
          <h1 className="text-3xl font-bold text-white mb-1">
            TanStack AI SDK
          </h1>
          <p className="text-gray-400 text-sm">
            Complete AI toolkit with approvals, client tools, and parts-based
            messages
          </p>
        </div>
      </div>

      <div className="flex-1 flex flex-col max-w-5xl mx-auto w-full px-6 py-8">
        <div className="flex-1 bg-gray-950/50 backdrop-blur-sm rounded-2xl border border-orange-500/10 shadow-2xl overflow-hidden flex flex-col">
          <Chat
            connection={fetchServerSentEvents("/api/tanchat")}
            onToolCall={async ({ toolName, input }) => {
              switch (toolName) {
                case "getPersonalGuitarPreference":
                  return { preference: "acoustic" };
                case "recommendGuitar":
                  return { id: input.id };
                case "addToWishList":
                  const wishList = JSON.parse(
                    localStorage.getItem("wishList") || "[]"
                  );
                  wishList.push(input.guitarId);
                  localStorage.setItem("wishList", JSON.stringify(wishList));
                  return {
                    success: true,
                    guitarId: input.guitarId,
                    totalItems: wishList.length,
                  };
                default:
                  throw new Error(`Unknown tool: ${toolName}`);
              }
            }}
            className="flex-1 flex flex-col min-h-0"
          >
            <ChatMessages className="flex-1 overflow-y-auto px-6 py-8 space-y-6">
              {(message) => (
                <ChatMessage
                  message={message}
                  className={
                    message.role === "user"
                      ? "flex justify-end"
                      : "flex justify-start"
                  }
                  partRenderers={{
                    text: ({ content }) => (
                      <TextPart
                        content={content}
                        role={message.role}
                        className="px-5 py-3 rounded-2xl max-w-[80%] shadow-lg"
                        userClassName="bg-orange-500 text-white"
                        assistantClassName="bg-gray-800/80 backdrop-blur-sm text-white prose dark:prose-invert max-w-none border border-gray-700/50"
                      />
                    ),
                    toolCall: ({
                      id,
                      name,
                      arguments: args,
                      state,
                      approval,
                    }) => {
                      if (name === "recommendGuitar") {
                        try {
                          const parsed = JSON.parse(args);
                          return <GuitarRecommendation id={parsed.id} />;
                        } catch {
                          return null;
                        }
                      }

                      if (approval && state === "approval-requested") {
                        return (
                          <ToolApproval
                            toolCallId={id}
                            toolName={name}
                            input={JSON.parse(args)}
                            approval={approval}
                          >
                            {({ toolName, input, onApprove, onDeny }) => (
                              <Approval
                                toolName={toolName}
                                input={input}
                                onApprove={onApprove}
                                onDeny={onDeny}
                              />
                            )}
                          </ToolApproval>
                        );
                      }

                      return null;
                    },
                  }}
                />
              )}
            </ChatMessages>

            <ChatInput
              placeholder="Ask about guitars..."
              className="border-t border-orange-500/10 bg-gray-900/50 backdrop-blur-sm px-6 py-5"
            />
          </Chat>
        </div>
      </div>
    </div>
  );
}
