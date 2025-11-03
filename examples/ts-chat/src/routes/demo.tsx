import { createFileRoute } from "@tanstack/react-router";
import { useCallback } from "react";
import {
  Chat,
  ChatMessages,
  ChatMessage,
  ChatInput,
  TextPart,
} from "@tanstack/ai-react-ui";
import { fetchServerSentEvents } from "@tanstack/ai-client";

import GuitarRecommendation from "@/components/example-GuitarRecommendation";

export const Route = createFileRoute("/demo")({
  component: DemoPage,
});

function DemoPage() {
  const handleToolCall = useCallback(
    async ({ toolName, input }: { toolName: string; input: any }) => {
      switch (toolName) {
        case "getPersonalGuitarPreference":
          return { preference: "acoustic" };
        case "recommendGuitar":
          return { id: input.id };
        case "addToWishList":
          const wishList = JSON.parse(localStorage.getItem("wishList") || "[]");
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
    },
    []
  );

  return (
    <div className="min-h-[92vh] flex flex-col">
      <Chat
        connection={fetchServerSentEvents("/api/tanchat")}
        onToolCall={handleToolCall}
        className="flex-1 flex flex-col min-h-0"
      >
        <ChatMessages className="flex-1 overflow-y-auto px-6 py-8 space-y-6">
          {(message) => (
            <ChatMessage
              message={message}
              className="flex"
              userClassName="justify-end"
              assistantClassName="justify-start"
              textPartRenderer={({ content }) => (
                <TextPart
                  content={content}
                  role={message.role}
                  className="px-5 py-3 rounded-2xl max-w-[80%] shadow-lg"
                  userClassName="bg-orange-500 text-white"
                  assistantClassName="bg-gray-800/80 backdrop-blur-sm text-white prose dark:prose-invert max-w-none border border-gray-700/50"
                />
              )}
              toolsRenderer={{
                recommendGuitar: ({ arguments: args }) => {
                  try {
                    const parsed = JSON.parse(args);
                    return <GuitarRecommendation id={parsed.id} />;
                  } catch {
                    return null;
                  }
                },
              }}
              defaultToolRenderer={() => null}
            />
          )}
        </ChatMessages>

        <ChatInput
          placeholder="Ask about guitars..."
          className="border-t border-orange-500/10 bg-gray-900/50 backdrop-blur-sm px-6 py-5"
        />
      </Chat>
    </div>
  );
}
