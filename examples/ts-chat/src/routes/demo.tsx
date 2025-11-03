import { createFileRoute } from "@tanstack/react-router";
import {
  Chat,
  ChatMessages,
  ChatMessage,
  ChatInput,
  ToolApproval,
} from "@tanstack/ai-react-ui";
import { fetchServerSentEvents } from "@tanstack/ai-client";
import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";
import { Send } from "lucide-react";

import GuitarRecommendation from "@/components/example-GuitarRecommendation";

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

      {/* Main Content */}
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
                      <div
                        className={`px-5 py-3 rounded-2xl max-w-[80%] shadow-lg ${
                          message.role === "user"
                            ? "bg-gradient-to-br from-orange-500 to-orange-600 text-white"
                            : "bg-gray-800/80 backdrop-blur-sm text-white prose dark:prose-invert max-w-none border border-gray-700/50"
                        }`}
                      >
                        <ReactMarkdown
                          rehypePlugins={[
                            rehypeRaw,
                            rehypeSanitize,
                            rehypeHighlight,
                            remarkGfm,
                          ]}
                        >
                          {content}
                        </ReactMarkdown>
                      </div>
                    ),
                    toolCall: ({
                      id,
                      name,
                      arguments: args,
                      state,
                      approval,
                    }) => {
                      // Show guitar recommendation
                      if (name === "recommendGuitar") {
                        try {
                          const parsed = JSON.parse(args);
                          return <GuitarRecommendation id={parsed.id} />;
                        } catch {
                          return null;
                        }
                      }

                      // Show approval dialog
                      if (approval && state === "approval-requested") {
                        return (
                          <ToolApproval
                            toolCallId={id}
                            toolName={name}
                            input={JSON.parse(args)}
                            approval={approval}
                          >
                            {({ toolName, input, onApprove, onDeny }) => (
                              <div className="p-5 bg-yellow-500/10 backdrop-blur-sm border border-yellow-500/30 rounded-2xl shadow-lg">
                                <p className="text-white font-semibold mb-3">
                                  Approve {toolName}?
                                </p>
                                <div className="text-gray-300 text-sm mb-4">
                                  <pre className="bg-gray-900/80 p-3 rounded-xl text-xs overflow-x-auto border border-gray-700/50">
                                    {JSON.stringify(input, null, 2)}
                                  </pre>
                                </div>
                                <div className="flex gap-3">
                                  <button
                                    onClick={onApprove}
                                    className="px-5 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-xl text-sm font-medium transition-all hover:shadow-lg"
                                  >
                                    ✓ Approve
                                  </button>
                                  <button
                                    onClick={onDeny}
                                    className="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-sm font-medium transition-all hover:shadow-lg"
                                  >
                                    ✗ Deny
                                  </button>
                                </div>
                              </div>
                            )}
                          </ToolApproval>
                        );
                      }

                      // Hide other tool calls (getGuitars, etc.)
                      return null;
                    },
                  }}
                />
              )}
            </ChatMessages>

            <ChatInput
              placeholder="Ask about guitars..."
              className="border-t border-orange-500/10 bg-gray-900/50 backdrop-blur-sm px-6 py-5"
            >
              {({ value, onChange, onSubmit, isLoading, inputRef }) => (
                <div className="relative max-w-4xl mx-auto">
                  <input
                    ref={inputRef}
                    type="text"
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder="Ask about guitars..."
                    disabled={isLoading}
                    className="w-full rounded-2xl border border-orange-500/20 bg-gray-800/50 backdrop-blur-sm px-5 pr-14 py-3.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500/40 focus:border-orange-500/40 shadow-lg transition-all"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        onSubmit();
                      }
                    }}
                  />
                  <button
                    onClick={onSubmit}
                    disabled={isLoading || !value.trim()}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-2.5 rounded-xl text-orange-500 hover:text-orange-400 hover:bg-orange-500/10 disabled:text-gray-600 disabled:hover:bg-transparent transition-all"
                  >
                    <Send className="w-5 h-5" />
                  </button>
                </div>
              )}
            </ChatInput>
          </Chat>
        </div>
      </div>
    </div>
  );
}
