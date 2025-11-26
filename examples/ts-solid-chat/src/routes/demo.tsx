import { createFileRoute } from "@tanstack/solid-router";
import { fetchServerSentEvents } from "@tanstack/ai-client";

import GuitarRecommendation from "@/components/example-GuitarRecommendation";

export const Route = createFileRoute("/demo")({
  component: DemoPage,
});

function DemoPage() {
  const handleToolCall = async ({
    toolName,
    input,
  }: {
    toolName: string;
    input: any;
  }) => {
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
  };

  return (
    <div class="h-[calc(100vh-72px)] flex flex-col bg-black">
      <Chat
        connection={fetchServerSentEvents("/api/tanchat")}
        onToolCall={handleToolCall}
        class="flex-1 flex flex-col min-h-0 bg-black"
      >
        <ChatMessages class="flex-1 overflow-y-auto px-6 py-8 space-y-6 bg-black">
          {(message) => (
            <ChatMessage
              message={message}
              class="flex"
              userclass="justify-end"
              assistantclass="justify-start"
              textPartRenderer={({ content }) => (
                <TextPart
                  content={content}
                  role={message.role}
                  class="px-5 py-3 rounded-2xl max-w-[80%] shadow-lg"
                  userclass="bg-orange-500 text-white"
                  assistantclass="bg-gray-800/80 backdrop-blur-sm text-white prose dark:prose-invert max-w-none border border-gray-700/50"
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
          class="border-t border-orange-500/10 bg-gray-900/50 backdrop-blur-sm px-6 py-5"
        />
      </Chat>
    </div>
  );
}
