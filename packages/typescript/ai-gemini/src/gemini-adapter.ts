import { GoogleGenAI } from "@google/genai";
import {
  BaseAdapter,
  type AIAdapterConfig,
  type ChatCompletionOptions,
  type ChatCompletionResult,
  type SummarizationOptions,
  type SummarizationResult,
  type EmbeddingOptions,
  type EmbeddingResult,
  type ModelMessage,
  type StreamChunk,
} from "@tanstack/ai";
import { GEMINI_MODELS, GEMINI_IMAGE_MODELS, GEMINI_EMBEDDING_MODELS, GEMINI_AUDIO_MODELS, GEMINI_VIDEO_MODELS, GeminiChatModels } from "./model-meta";
import { TextProviderOptions } from "./text/text-provider-options";
import { convertToolsToProviderFormat } from "./tools/tool-converter";

export interface GeminiAdapterConfig extends AIAdapterConfig {
  apiKey: string;
}

export type GeminiModel = (typeof GEMINI_MODELS)[number];

/**
 * Gemini-specific provider options
 * Based on Google Generative AI SDK
 * @see https://ai.google.dev/api/rest/v1/GenerationConfig
 */
export interface GeminiProviderOptions {
  /** Number of candidate responses to generate */
  candidateCount?: number;
  /** Safety settings for content filtering */
  safetySettings?: Array<{
    category: string;
    threshold: string;
  }>;
  /** Response MIME type */
  responseMimeType?: string;
  /** Response schema for structured output */
  responseSchema?: any;
}

function formatMessages(messages: ModelMessage[]): Array<{ role: "user" | "model"; parts: Array<{ text?: string; functionCall?: { name: string; args: Record<string, any> }; functionResponse?: { name: string; response: Record<string, any> } }> }> {
  return messages
    .filter((m) => m.role !== "system") // Skip system messages
    .map((msg) => {
      const role: "user" | "model" = msg.role === "assistant" ? "model" : "user";
      const parts: Array<{ text?: string; functionCall?: { name: string; args: Record<string, any> }; functionResponse?: { name: string; response: Record<string, any> } }> = [];

      // Add text content if present
      if (msg.content) {
        parts.push({ text: msg.content });
      }

      // Handle tool calls (from assistant)
      if (msg.role === "assistant" && msg.toolCalls?.length) {
        for (const toolCall of msg.toolCalls) {
          let parsedArgs: Record<string, any> = {};
          try {
            parsedArgs = toolCall.function.arguments
              ? JSON.parse(toolCall.function.arguments)
              : {};
          } catch {
            parsedArgs = toolCall.function.arguments as any;
          }

          parts.push({
            functionCall: {
              name: toolCall.function.name,
              args: parsedArgs,
            },
          });
        }
      }

      // Handle tool results (from tool role)
      if (msg.role === "tool" && msg.toolCallId) {
        parts.push({
          functionResponse: {
            name: msg.toolCallId, // Gemini uses function name here
            response: {
              content: msg.content || "",
            },
          },
        });
      }

      return {
        role,
        parts: parts.length > 0 ? parts : [{ text: "" }],
      };
    });
}


/**
 * Maps common options to Gemini-specific format
 * Handles translation of normalized options to Gemini's API format
 */
function mapCommonOptionsToGemini(
  options: ChatCompletionOptions
): TextProviderOptions {
  const providerOpts = options.providerOptions as TextProviderOptions | undefined;

  const generationConfig: TextProviderOptions = {
    ...providerOpts,
    model: options.model as GeminiChatModels,
    generationConfig: {
      temperature: options.options?.temperature,
      topP: options.options?.topP,
      maxOutputTokens: options.options?.maxTokens,
      ...providerOpts?.generationConfig
    },

    systemInstruction: options.systemPrompts?.join("\n"),
    contents: formatMessages(options.messages) as any,
  };

  return {
    ...generationConfig,
    tools: options.tools ? convertToolsToProviderFormat(options.tools) : undefined,
  };
}

export class GeminiAdapter extends BaseAdapter<
  typeof GEMINI_MODELS,
  typeof GEMINI_IMAGE_MODELS,
  readonly string[],
  readonly string[],
  readonly string[],
  GeminiProviderOptions,
  Record<string, any>,
  Record<string, any>,
  Record<string, any>,
  Record<string, any>
> {
  name = "gemini";
  models = GEMINI_MODELS;
  imageModels = GEMINI_IMAGE_MODELS;
  embeddingModels = GEMINI_EMBEDDING_MODELS;
  audioModels = GEMINI_AUDIO_MODELS;
  videoModels = GEMINI_VIDEO_MODELS;
  private client: GoogleGenAI;

  constructor(config: GeminiAdapterConfig) {
    super(config);
    this.client = new GoogleGenAI({
      apiKey: config.apiKey,
    });
  }

  async chatCompletion(
    options: ChatCompletionOptions
  ): Promise<ChatCompletionResult> {
    // Map common options to Gemini format
    const mappedOptions = mapCommonOptionsToGemini(options);

    const response = await this.client.models.generateContent(mappedOptions);


    return {
      id: this.generateId(),
      model: options.model || "gemini-pro",
      content: response.data ?? "",
      role: "assistant",
      finishReason: (response.candidates?.[0]?.finishReason as any) || "stop",
      usage: {
        promptTokens: response.usageMetadata?.promptTokenCount ?? 0,
        completionTokens: response.usageMetadata?.thoughtsTokenCount ?? 0,
        totalTokens: response.usageMetadata?.totalTokenCount ?? 0
      },
    };
  }


  async *chatStream(
    options: ChatCompletionOptions
  ): AsyncIterable<StreamChunk> {
    // Map common options to Gemini format
    const mappedOptions = mapCommonOptionsToGemini(options);

    const result = await this.client.models.generateContentStream(mappedOptions);

    const timestamp = Date.now();
    let accumulatedContent = "";

    // Iterate over the stream result (it's already an AsyncGenerator)
    for await (const chunk of result) {
      const content = chunk.data || "";
      accumulatedContent += content;

      if (content) {
        yield {
          type: "content",
          id: this.generateId(),
          model: options.model || "gemini-pro",
          timestamp,
          delta: content,
          content: accumulatedContent,
          role: "assistant",
        };
      }

      // Check for finish reason
      if (chunk.candidates?.[0]?.finishReason) {
        yield {
          type: "done",
          id: this.generateId(),
          model: options.model || "gemini-pro",
          timestamp,
          finishReason: chunk.candidates[0].finishReason as any,
          usage: chunk.usageMetadata ? {
            promptTokens: chunk.usageMetadata.promptTokenCount ?? 0,
            completionTokens: chunk.usageMetadata.thoughtsTokenCount ?? 0,
            totalTokens: chunk.usageMetadata.totalTokenCount ?? 0,
          } : undefined,
        };
      }
    }
  }



  async summarize(options: SummarizationOptions): Promise<SummarizationResult> {
    const prompt = this.buildSummarizationPrompt(options, options.text);

    const model = (this.client as any).getGenerativeModel({
      model: options.model || "gemini-pro",
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: options.maxLength || 500,
      },
    });

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const summary = response.text();

    const promptTokens = this.estimateTokens(prompt);
    const completionTokens = this.estimateTokens(summary);

    return {
      id: this.generateId(),
      model: options.model || "gemini-pro",
      summary,
      usage: {
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
      },
    };
  }

  async createEmbeddings(options: EmbeddingOptions): Promise<EmbeddingResult> {
    const inputs = Array.isArray(options.input)
      ? options.input
      : [options.input];
    const embeddings: number[][] = [];

    const model = (this.client as any).getGenerativeModel({
      model: options.model || "embedding-001",
    });

    for (const input of inputs) {
      const result = await model.embedContent(input);
      embeddings.push(result.embedding.values);
    }

    const promptTokens = inputs.reduce(
      (sum, input) => sum + this.estimateTokens(input),
      0
    );

    return {
      id: this.generateId(),
      model: options.model || "embedding-001",
      embeddings,
      usage: {
        promptTokens,
        totalTokens: promptTokens,
      },
    };
  }

  private buildSummarizationPrompt(
    options: SummarizationOptions,
    text: string
  ): string {
    let prompt = "You are a professional summarizer. ";

    switch (options.style) {
      case "bullet-points":
        prompt += "Provide a summary in bullet point format. ";
        break;
      case "paragraph":
        prompt += "Provide a summary in paragraph format. ";
        break;
      case "concise":
        prompt += "Provide a very concise summary in 1-2 sentences. ";
        break;
      default:
        prompt += "Provide a clear and concise summary. ";
    }

    if (options.focus && options.focus.length > 0) {
      prompt += `Focus on the following aspects: ${options.focus.join(", ")}. `;
    }

    prompt += `\n\nText to summarize:\n${text}\n\nSummary:`;

    return prompt;
  }

  private estimateTokens(text: string): number {
    // Rough approximation: 1 token ≈ 4 characters
    return Math.ceil(text.length / 4);
  }
}
