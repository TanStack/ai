// Claude AI service for handling queued AI responses
import { anthropic } from "@tanstack/ai-anthropic";
import { chat } from "@tanstack/ai";
import type { ModelMessage, StreamChunk } from "@tanstack/ai";

export interface ClaudeRequest {
  id: string;
  username: string;
  message: string;
  conversationHistory: ModelMessage[];
}

export interface ClaudeQueueStatus {
  current: string | null;
  queue: string[];
  isProcessing: boolean;
}

export class ClaudeService {
  private adapter = anthropic(); // Uses ANTHROPIC_API_KEY from env
  private queue: ClaudeRequest[] = [];
  private currentRequest: ClaudeRequest | null = null;
  private isProcessing = false;

  enqueue(request: ClaudeRequest): void {
    console.log(`🤖 Claude: Enqueuing request from ${request.username}`);
    this.queue.push(request);
  }

  getQueueStatus(): ClaudeQueueStatus {
    return {
      current: this.currentRequest?.username || null,
      queue: this.queue.map((r) => r.username),
      isProcessing: this.isProcessing,
    };
  }

  startProcessing(): void {
    if (this.isProcessing || this.queue.length === 0) return;

    this.isProcessing = true;
    this.currentRequest = this.queue.shift()!;
    console.log(
      `🤖 Claude: Started processing request from ${this.currentRequest.username}`
    );
  }

  finishProcessing(): void {
    console.log(
      `🤖 Claude: Finished processing request from ${this.currentRequest?.username}`
    );
    this.currentRequest = null;
    this.isProcessing = false;
  }

  async *streamResponse(
    conversationHistory: ModelMessage[]
  ): AsyncIterable<StreamChunk> {
    const systemMessage: ModelMessage = {
      role: "system",
      content:
        "You are Claude, a friendly AI assistant participating in a group chat. Keep responses conversational, concise (2-3 sentences max unless asked for more detail), and helpful. You can see the entire conversation history with all participants.",
    };

    try {
      console.log(`🤖 Claude: ========== STARTING STREAM RESPONSE ==========`);
      console.log(
        `🤖 Claude: Conversation history (${conversationHistory.length} messages):`
      );
      conversationHistory.forEach((m, i) => {
        console.log(`  ${i + 1}. ${m.role}: ${m.content?.substring(0, 80)}...`);
      });

      let chunkCount = 0;
      let accumulatedContent = "";

      for await (const chunk of chat({
        adapter: this.adapter,
        messages: [systemMessage, ...conversationHistory],
        model: "claude-sonnet-4-5-20250929",
      })) {
        chunkCount++;

        if (chunk.type === "content" && chunk.delta) {
          accumulatedContent += chunk.delta;
          console.log(
            `🤖 Claude: Chunk #${chunkCount} [content] delta: "${chunk.delta}" (total: ${accumulatedContent.length} chars)`
          );
        } else {
          console.log(
            `🤖 Claude: Chunk #${chunkCount} [${chunk.type}]`,
            JSON.stringify(chunk, null, 2).substring(0, 200)
          );
        }

        yield chunk;
      }

      console.log(`🤖 Claude: ========== STREAM COMPLETE ==========`);
      console.log(
        `🤖 Claude: Total chunks: ${chunkCount}, Final content: "${accumulatedContent}"`
      );
    } catch (error) {
      console.error("🤖 Claude: ========== ERROR IN STREAM ==========");
      console.error("🤖 Claude: Error streaming response:", error);
      throw error;
    }
  }
}

// Global singleton instance
export const globalClaudeService = new ClaudeService();
