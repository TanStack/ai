import { GoogleGenerativeAI, Content } from "@google/generative-ai";
import {
  BaseAdapter,
  convertChatCompletionStream,
  type AIAdapterConfig,
  type ChatCompletionOptions,
  type ChatCompletionResult,
  type ChatCompletionChunk,
  type TextGenerationOptions,
  type TextGenerationResult,
  type SummarizationOptions,
  type SummarizationResult,
  type EmbeddingOptions,
  type EmbeddingResult,
  type StreamChunk,
} from "@tanstack/ai";
import { GEMINI_MODELS, GEMINI_IMAGE_MODELS, GEMINI_EMBEDDING_MODELS, GEMINI_AUDIO_MODELS, GEMINI_VIDEO_MODELS } from "./model-meta";

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

/**
 * Maps common options to Gemini-specific format
 * Handles translation of normalized options to Gemini's API format
 */
function mapCommonOptionsToGemini(
  options: ChatCompletionOptions,
  providerOpts?: GeminiProviderOptions
): any {
  const generationConfig: any = {
    temperature: options.temperature,
    topP: options.topP,
    maxOutputTokens: options.maxTokens,
    stopSequences: options.stopSequences,
  };

  // Map common penalties
  if (options.presencePenalty !== undefined) {
    generationConfig.presencePenalty = options.presencePenalty;
  }
  if (options.frequencyPenalty !== undefined) {
    generationConfig.frequencyPenalty = options.frequencyPenalty;
  }

  // Apply Gemini-specific provider options
  if (providerOpts) {
    if (providerOpts.candidateCount) {
      generationConfig.candidateCount = providerOpts.candidateCount;
    }
    if (providerOpts.responseMimeType) {
      generationConfig.responseMimeType = providerOpts.responseMimeType;
    }
    if (providerOpts.responseSchema) {
      generationConfig.responseSchema = providerOpts.responseSchema;
    }
  }

  // Map response format to Gemini's responseMimeType
  if (options.responseFormat) {
    if (options.responseFormat.type === "json_object") {
      generationConfig.responseMimeType = "application/json";
    } else if (
      options.responseFormat.type === "json_schema" &&
      options.responseFormat.json_schema
    ) {
      generationConfig.responseMimeType = "application/json";
      generationConfig.responseSchema =
        options.responseFormat.json_schema.schema;
    }
  }

  return {
    model: options.model || "gemini-pro",
    generationConfig,
    safetySettings: providerOpts?.safetySettings,
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
  private client: GoogleGenerativeAI;

  constructor(config: GeminiAdapterConfig) {
    super(config);
    this.client = new GoogleGenerativeAI(config.apiKey);
  }

  async chatCompletion(
    options: ChatCompletionOptions
  ): Promise<ChatCompletionResult> {
    const providerOpts = options.providerOptions as
      | GeminiProviderOptions
      | undefined;

    // Map common options to Gemini format
    const mappedOptions = mapCommonOptionsToGemini(options, providerOpts);

    const model = this.client.getGenerativeModel({
      model: mappedOptions.model,
      generationConfig: mappedOptions.generationConfig,
      safetySettings: mappedOptions.safetySettings,
    });

    const history = this.formatMessagesForGemini(options.messages.slice(0, -1));
    const lastMessage = options.messages[options.messages.length - 1];

    const chat = model.startChat({ history });
    const result = await chat.sendMessage(lastMessage.content || "");
    const response = await result.response;
    const text = response.text();

    // Estimate token usage
    const promptTokens = this.estimateTokens(
      options.messages.map((m) => m.content).join(" ")
    );
    const completionTokens = this.estimateTokens(text);

    return {
      id: this.generateId(),
      model: options.model || "gemini-pro",
      content: text,
      role: "assistant",
      finishReason: (response.candidates?.[0]?.finishReason as any) || "stop",
      usage: {
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
      },
    };
  }

  async *chatCompletionStream(
    options: ChatCompletionOptions
  ): AsyncIterable<ChatCompletionChunk> {
    const providerOpts = options.providerOptions as
      | GeminiProviderOptions
      | undefined;

    // Map common options to Gemini format
    const mappedOptions = mapCommonOptionsToGemini(options, providerOpts);

    const model = this.client.getGenerativeModel({
      model: mappedOptions.model,
      generationConfig: mappedOptions.generationConfig,
      safetySettings: mappedOptions.safetySettings,
    });

    const history = this.formatMessagesForGemini(options.messages.slice(0, -1));
    const lastMessage = options.messages[options.messages.length - 1];

    const chat = model.startChat({ history });
    const result = await chat.sendMessageStream(lastMessage.content || "");

    for await (const chunk of result.stream) {
      const text = chunk.text();
      if (text) {
        yield {
          id: this.generateId(),
          model: options.model || "gemini-pro",
          content: text,
          finishReason: (chunk.candidates?.[0]?.finishReason as any) || null,
        };
      }
    }
  }

  async *chatStream(
    options: ChatCompletionOptions
  ): AsyncIterable<StreamChunk> {
    // Use stream converter for now
    // TODO: Implement native structured streaming for Gemini
    yield* convertChatCompletionStream(
      this.chatCompletionStream(options),
      options.model || "gemini-pro"
    );
  }

  async generateText(
    options: TextGenerationOptions
  ): Promise<TextGenerationResult> {
    const model = this.client.getGenerativeModel({
      model: options.model || "gemini-pro",
      generationConfig: {
        temperature: options.temperature,
        topP: options.topP,
        maxOutputTokens: options.maxTokens,
        stopSequences: options.stopSequences,
      },
    });

    const result = await model.generateContent(options.prompt);
    const response = await result.response;
    const text = response.text();

    const promptTokens = this.estimateTokens(options.prompt);
    const completionTokens = this.estimateTokens(text);

    return {
      id: this.generateId(),
      model: options.model || "gemini-pro",
      text,
      finishReason: (response.candidates?.[0]?.finishReason as any) || "stop",
      usage: {
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
      },
    };
  }

  async *generateTextStream(
    options: TextGenerationOptions
  ): AsyncIterable<string> {
    const model = this.client.getGenerativeModel({
      model: options.model || "gemini-pro",
      generationConfig: {
        temperature: options.temperature,
        topP: options.topP,
        maxOutputTokens: options.maxTokens,
        stopSequences: options.stopSequences,
      },
    });

    const result = await model.generateContentStream(options.prompt);

    for await (const chunk of result.stream) {
      const text = chunk.text();
      if (text) {
        yield text;
      }
    }
  }

  async summarize(options: SummarizationOptions): Promise<SummarizationResult> {
    const prompt = this.buildSummarizationPrompt(options, options.text);

    const model = this.client.getGenerativeModel({
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

    const model = this.client.getGenerativeModel({
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

  private formatMessagesForGemini(messages: Message[]): Content[] {
    return messages.map((msg) => ({
      role: msg.role === "assistant" ? "model" : "user",
      parts: [{ text: msg.content || "" }],
    }));
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
