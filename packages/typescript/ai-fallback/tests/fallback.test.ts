import { describe, it, expect, vi, beforeEach } from "vitest";
import { ai } from "@tanstack/ai";
import { BaseAdapter } from "@tanstack/ai";
import type {
  ChatCompletionOptions,
  ChatCompletionResult,
  StreamChunk,
  SummarizationOptions,
  SummarizationResult,
  EmbeddingOptions,
  EmbeddingResult,
} from "@tanstack/ai";
import { fallback, withModel } from "../src/index";

// Mock adapter that can be configured to succeed or fail
class MockAdapter extends BaseAdapter<
  readonly ["test-model"],
  readonly [],
  readonly [],
  readonly [],
  readonly []
> {
  name: string;
  models = ["test-model"] as const;
  private shouldFail: boolean;
  private errorMessage: string;
  private succeedWith: any;

  constructor(
    name: string,
    shouldFail: boolean = false,
    errorMessage: string = "Adapter failed",
    succeedWith?: any
  ) {
    super();
    this.name = name;
    this.shouldFail = shouldFail;
    this.errorMessage = errorMessage;
    this.succeedWith = succeedWith || {
      id: `${name}-123`,
      model: "test-model",
      content: `Success from ${name}`,
      usage: {
        promptTokens: 10,
        completionTokens: 20,
        totalTokens: 30,
      },
    };
  }

  async chatCompletion(
    options: ChatCompletionOptions
  ): Promise<ChatCompletionResult> {
    if (this.shouldFail) {
      throw new Error(this.errorMessage);
    }
    return this.succeedWith;
  }

  async *chatCompletionStream(
    _options: ChatCompletionOptions
  ): AsyncIterable<any> {
    if (this.shouldFail) {
      throw new Error(this.errorMessage);
    }
    yield {
      id: `${this.name}-123`,
      model: "test-model",
      content: "chunk1",
      role: "assistant",
    };
    yield {
      id: `${this.name}-123`,
      model: "test-model",
      content: "chunk2",
      role: "assistant",
    };
  }

  async *chatStream(
    _options: ChatCompletionOptions
  ): AsyncIterable<StreamChunk> {
    if (this.shouldFail) {
      throw new Error(this.errorMessage);
    }
    const id = `${this.name}-123`;
    const timestamp = Date.now();
    yield {
      type: "content",
      id,
      model: "test-model",
      timestamp,
      delta: "Hello",
      content: "Hello",
      role: "assistant",
    };
    yield {
      type: "content",
      id,
      model: "test-model",
      timestamp,
      delta: " World",
      content: "Hello World",
      role: "assistant",
    };
    yield {
      type: "done",
      id,
      model: "test-model",
      timestamp,
      finishReason: "stop",
      usage: {
        promptTokens: 10,
        completionTokens: 20,
        totalTokens: 30,
      },
    };
  }

  async generateText(_options: any): Promise<any> {
    if (this.shouldFail) {
      throw new Error(this.errorMessage);
    }
    return { text: `Text from ${this.name}` };
  }

  async *generateTextStream(_options: any): AsyncIterable<string> {
    if (this.shouldFail) {
      throw new Error(this.errorMessage);
    }
    yield "text";
    yield " chunk";
  }

  async summarize(options: SummarizationOptions): Promise<SummarizationResult> {
    if (this.shouldFail) {
      throw new Error(this.errorMessage);
    }
    return {
      summary: `Summary from ${this.name}`,
      id: `${this.name}-123`,
      model: options.model,
      usage: {
        promptTokens: 10,
        completionTokens: 20,
        totalTokens: 30,
      },
    };
  }

  async createEmbeddings(options: EmbeddingOptions): Promise<EmbeddingResult> {
    if (this.shouldFail) {
      throw new Error(this.errorMessage);
    }
    return {
      embeddings: [[0.1, 0.2, 0.3]],
      id: `${this.name}-123`,
      model: options.model,
      usage: {
        promptTokens: 10,
        completionTokens: 0,
        totalTokens: 10,
      },
    };
  }
}

describe("ai-fallback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  describe("withModel", () => {
    it("should create a BoundAI instance", () => {
      const adapter = new MockAdapter("test-adapter");
      const aiInstance = ai(adapter);
      const bound = withModel(aiInstance, {
        model: "test-model",
        temperature: 0.7,
      });

      expect(bound).toBeDefined();
      expect(bound.adapterName).toBe("test-adapter");
    });
  });

  describe("fallback - chatCompletion", () => {
    it("should use first adapter when it succeeds", async () => {
      const adapter1 = new MockAdapter("adapter1", false);
      const adapter2 = new MockAdapter("adapter2", false);

      const ai1 = ai(adapter1);
      const ai2 = ai(adapter2);

      const bound1 = withModel(ai1, { model: "test-model" });
      const bound2 = withModel(ai2, { model: "test-model" });

      const fallbackAI = fallback([bound1, bound2]);

      const result = await fallbackAI.chatCompletion({
        messages: [{ role: "user", content: "Hello" }],
      });

      expect(result.content).toBe("Success from adapter1");
      expect(console.warn).not.toHaveBeenCalled();
    });

    it("should fallback to second adapter when first fails", async () => {
      const adapter1 = new MockAdapter("adapter1", true, "Rate limit exceeded");
      const adapter2 = new MockAdapter("adapter2", false);

      const ai1 = ai(adapter1);
      const ai2 = ai(adapter2);

      const bound1 = withModel(ai1, { model: "test-model" });
      const bound2 = withModel(ai2, { model: "test-model" });

      const fallbackAI = fallback([bound1, bound2]);

      const result = await fallbackAI.chatCompletion({
        messages: [{ role: "user", content: "Hello" }],
      });

      expect(result.content).toBe("Success from adapter2");
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('Adapter "adapter1" failed'),
        "Rate limit exceeded"
      );
    });

    it("should throw comprehensive error when all adapters fail", async () => {
      const adapter1 = new MockAdapter("adapter1", true, "Rate limit exceeded");
      const adapter2 = new MockAdapter("adapter2", true, "Service unavailable");

      const ai1 = ai(adapter1);
      const ai2 = ai(adapter2);

      const bound1 = withModel(ai1, { model: "test-model" });
      const bound2 = withModel(ai2, { model: "test-model" });

      const fallbackAI = fallback([bound1, bound2]);

      await expect(
        fallbackAI.chatCompletion({
          messages: [{ role: "user", content: "Hello" }],
        })
      ).rejects.toThrow("All adapters failed for chatCompletion");

      await expect(
        fallbackAI.chatCompletion({
          messages: [{ role: "user", content: "Hello" }],
        })
      ).rejects.toThrow(/adapter1: Rate limit exceeded/);

      await expect(
        fallbackAI.chatCompletion({
          messages: [{ role: "user", content: "Hello" }],
        })
      ).rejects.toThrow(/adapter2: Service unavailable/);
    });

    it("should call onError callback when adapter fails", async () => {
      const adapter1 = new MockAdapter("adapter1", true, "Rate limit exceeded");
      const adapter2 = new MockAdapter("adapter2", false);

      const ai1 = ai(adapter1);
      const ai2 = ai(adapter2);

      const bound1 = withModel(ai1, { model: "test-model" });
      const bound2 = withModel(ai2, { model: "test-model" });

      const onError = vi.fn();
      const fallbackAI = fallback([bound1, bound2], { onError });

      await fallbackAI.chatCompletion({
        messages: [{ role: "user", content: "Hello" }],
      });

      expect(onError).toHaveBeenCalledWith("adapter1", expect.any(Error));
      expect(onError).toHaveBeenCalledTimes(1);
    });

    it("should stop trying when stopOnError returns true", async () => {
      const adapter1 = new MockAdapter("adapter1", true, "401 Unauthorized");
      const adapter2 = new MockAdapter("adapter2", false);

      const ai1 = ai(adapter1);
      const ai2 = ai(adapter2);

      const bound1 = withModel(ai1, { model: "test-model" });
      const bound2 = withModel(ai2, { model: "test-model" });

      const stopOnError = (error: Error) => error.message.includes("401");
      const fallbackAI = fallback([bound1, bound2], { stopOnError });

      await expect(
        fallbackAI.chatCompletion({
          messages: [{ role: "user", content: "Hello" }],
        })
      ).rejects.toThrow("401 Unauthorized");

      // When stopOnError returns true, we throw immediately without logging warning
      // Should not have tried adapter2 (no warnings at all when stopping early)
      expect(console.warn).not.toHaveBeenCalled();
    });
  });

  describe("fallback - chat (streaming)", () => {
    it("should use first adapter when it succeeds", async () => {
      const adapter1 = new MockAdapter("adapter1", false);
      const adapter2 = new MockAdapter("adapter2", false);

      const ai1 = ai(adapter1);
      const ai2 = ai(adapter2);

      const bound1 = withModel(ai1, { model: "test-model" });
      const bound2 = withModel(ai2, { model: "test-model" });

      const fallbackAI = fallback([bound1, bound2]);

      const chunks: StreamChunk[] = [];
      for await (const chunk of fallbackAI.chat({
        messages: [{ role: "user", content: "Hello" }],
      })) {
        chunks.push(chunk);
      }

      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks[0].model).toBe("test-model");
      expect(console.warn).not.toHaveBeenCalled();
    });

    it("should fallback to second adapter when first fails before streaming", async () => {
      const adapter1 = new MockAdapter("adapter1", true, "Connection error");
      const adapter2 = new MockAdapter("adapter2", false);

      const ai1 = ai(adapter1);
      const ai2 = ai(adapter2);

      const bound1 = withModel(ai1, { model: "test-model" });
      const bound2 = withModel(ai2, { model: "test-model" });

      const fallbackAI = fallback([bound1, bound2]);

      const chunks: StreamChunk[] = [];
      for await (const chunk of fallbackAI.chat({
        messages: [{ role: "user", content: "Hello" }],
      })) {
        chunks.push(chunk);
      }

      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks[0].model).toBe("test-model");
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('Adapter "adapter1" failed'),
        "Connection error"
      );
    });

    it("should throw when all adapters fail", async () => {
      const adapter1 = new MockAdapter("adapter1", true, "Error 1");
      const adapter2 = new MockAdapter("adapter2", true, "Error 2");

      const ai1 = ai(adapter1);
      const ai2 = ai(adapter2);

      const bound1 = withModel(ai1, { model: "test-model" });
      const bound2 = withModel(ai2, { model: "test-model" });

      const fallbackAI = fallback([bound1, bound2]);

      const chunks: StreamChunk[] = [];
      let error: Error | null = null;

      try {
        for await (const chunk of fallbackAI.chat({
          messages: [{ role: "user", content: "Hello" }],
        })) {
          chunks.push(chunk);
        }
      } catch (e) {
        error = e as Error;
      }

      expect(error).toBeTruthy();
      expect(error!.message).toContain("All adapters failed for chat");
      expect(error!.message).toContain("adapter1: Error 1");
      expect(error!.message).toContain("adapter2: Error 2");
    });
  });

  describe("fallback - embed", () => {
    it("should use first adapter when it succeeds", async () => {
      const adapter1 = new MockAdapter("adapter1", false);
      const adapter2 = new MockAdapter("adapter2", false);

      const ai1 = ai(adapter1);
      const ai2 = ai(adapter2);

      const bound1 = withModel(ai1, { model: "test-model" });
      const bound2 = withModel(ai2, { model: "test-model" });

      const fallbackAI = fallback([bound1, bound2]);

      const result = await fallbackAI.embed({
        input: "test text",
      });

      expect(result.embeddings).toBeDefined();
      expect(result.model).toBe("test-model");
      expect(console.warn).not.toHaveBeenCalled();
    });

    it("should fallback to second adapter when first fails", async () => {
      const adapter1 = new MockAdapter("adapter1", true, "Embedding error");
      const adapter2 = new MockAdapter("adapter2", false);

      const ai1 = ai(adapter1);
      const ai2 = ai(adapter2);

      const bound1 = withModel(ai1, { model: "test-model" });
      const bound2 = withModel(ai2, { model: "test-model" });

      const fallbackAI = fallback([bound1, bound2]);

      const result = await fallbackAI.embed({
        input: "test text",
      });

      expect(result.embeddings).toBeDefined();
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('Adapter "adapter1" failed'),
        "Embedding error"
      );
    });
  });

  describe("fallback - summarize", () => {
    it("should fallback to second adapter when first fails", async () => {
      const adapter1 = new MockAdapter("adapter1", true, "Summarization error");
      const adapter2 = new MockAdapter("adapter2", false);

      const ai1 = ai(adapter1);
      const ai2 = ai(adapter2);

      const bound1 = withModel(ai1, { model: "test-model" });
      const bound2 = withModel(ai2, { model: "test-model" });

      const fallbackAI = fallback([bound1, bound2]);

      const result = await fallbackAI.summarize({
        text: "Long text to summarize",
      });

      expect(result.summary).toBe("Summary from adapter2");
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('Adapter "adapter1" failed'),
        "Summarization error"
      );
    });
  });

  describe("fallback - multiple adapters", () => {
    it("should try all adapters in order until one succeeds", async () => {
      const adapter1 = new MockAdapter("adapter1", true, "Error 1");
      const adapter2 = new MockAdapter("adapter2", true, "Error 2");
      const adapter3 = new MockAdapter("adapter3", false);

      const ai1 = ai(adapter1);
      const ai2 = ai(adapter2);
      const ai3 = ai(adapter3);

      const bound1 = withModel(ai1, { model: "test-model" });
      const bound2 = withModel(ai2, { model: "test-model" });
      const bound3 = withModel(ai3, { model: "test-model" });

      const fallbackAI = fallback([bound1, bound2, bound3]);

      const result = await fallbackAI.chatCompletion({
        messages: [{ role: "user", content: "Hello" }],
      });

      expect(result.content).toBe("Success from adapter3");
      expect(console.warn).toHaveBeenCalledTimes(2);
    });
  });
});
