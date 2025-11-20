import { MessageParam, TextBlockParam, } from "@anthropic-ai/sdk/resources/messages";
import { AnthropicTool } from "../tools";
import { BetaContextManagementConfig, BetaToolChoiceAny, BetaToolChoiceAuto, BetaToolChoiceTool } from "@anthropic-ai/sdk/resources/beta/messages/messages";

export interface TextProviderOptions {

  model: string;

  messages: MessageParam[]

  /**
   * The maximum number of tokens to generate before stopping.  This parameter only specifies the absolute maximum number of tokens to generate.
   * Range x >= 1.
   */
  max_tokens: number;
  /**
   * Container identifier for reuse across requests.
   * Container parameters with skills to be loaded.
   */
  container?: {
    id: string | null;
    /**
     * List of skills to load into the container
     */
    skills: {
      /**
       * Between 1-64 characters
       */
      skill_id: string;

      type: "anthropic" | "custom";
      /**
       * Skill version or latest by default
       */
      version?: string
    }[] | null
  } | null
  /**
   * Context management configuration.

This allows you to control how Claude manages context across multiple requests, such as whether to clear function results or not.
   */
  context_management?: BetaContextManagementConfig | null
  /**
   * MCP servers to be utilized in this request
   * Maximum of 20 servers
   */
  mcp_servers?: MCPServer[]


  /**
   * Determines whether to use priority capacity (if available) or standard capacity for this request.
   */
  service_tier?: "auto" | "standard_only"
  /**
   * Custom text sequences that will cause the model to stop generating.

Anthropic models will normally stop when they have naturally completed their turn, which will result in a response stop_reason of "end_turn".

If you want the model to stop generating when it encounters custom strings of text, you can use the stop_sequences parameter. If the model encounters one of the custom sequences, the response stop_reason value will be "stop_sequence" and the response stop_sequence value will contain the matched stop sequence.
   */
  stop_sequences?: string[];
  /**
   * Whether to incrementally stream the response using server-sent events.
   */
  stream?: boolean;
  /**
    * stem prompt.
 
 A system prompt is a way of providing context and instructions to Claude, such as specifying a particular goal or role.
    */
  system?: string | TextBlockParam[]
  /**
      * Amount of randomness injected into the response.
      * Either use this or top_p, but not both.
      * Defaults to 1.0. Ranges from 0.0 to 1.0. Use temperature closer to 0.0 for analytical / multiple choice, and closer to 1.0 for creative and generative tasks.
      * @default 1.0
      */
  temperature?: number;
  /**
     * Configuration for enabling Claude's extended thinking.

When enabled, responses include thinking content blocks showing Claude's thinking process before the final answer. Requires a minimum budget of 1,024 tokens and counts towards your max_tokens limit.
     */
  thinking?: {
    /**
     * Determines how many tokens Claude can use for its internal reasoning process. Larger budgets can enable more thorough analysis for complex problems, improving response quality.

Must be ≥1024 and less than max_tokens
     */
    budget_tokens: number;

    type: "enabled"
  } | {
    type: "disabled"
  }

  tool_choice?: BetaToolChoiceAny | BetaToolChoiceTool | BetaToolChoiceAuto

  tools?: AnthropicTool[]
  /**
   * Only sample from the top K options for each subsequent token.

Used to remove "long tail" low probability responses.
Recommended for advanced use cases only. You usually only need to use temperature.

Required range: x >= 0
   */
  top_k?: number;
  /**
   * Use nucleus sampling.

In nucleus sampling, we compute the cumulative distribution over all the options for each subsequent token in decreasing probability order and cut it off once it reaches a particular probability specified by top_p. You should either alter temperature or top_p, but not both.
   */
  top_p?: number;
}

export const validateTopPandTemperature = (options: TextProviderOptions) => {
  if (options.top_p !== null && options.temperature !== undefined) {
    throw new Error("You should either set top_p or temperature, but not both.");
  }
}

export interface CacheControl {
  type: "ephemeral",
  ttl: "5m" | "1h"
}

export const validateThinking = (options: TextProviderOptions) => {
  const thinking = options.thinking;
  if (thinking && thinking.type === "enabled") {
    if (thinking.budget_tokens < 1024) {
      throw new Error("thinking.budget_tokens must be at least 1024.");
    }
    if (thinking.budget_tokens >= options.max_tokens) {
      throw new Error("thinking.budget_tokens must be less than max_tokens.");
    }
  }
}
export type Citation = (CharacterLocationCitation | PageCitation | ContentBlockCitation | WebSearchResultCitation | RequestSearchResultLocation);

interface CharacterLocationCitation {
  cited_text: string;
  /**
   * Bigger than 0
   */
  document_index: number;
  /**
   * Between 1-255 characters
   */
  document_title: string | null;

  end_char_index: number;

  start_char_index: number;

  type: "char_location"
}

interface PageCitation {
  cited_text: string;
  /**
   * Bigger than 0
   */
  document_index: number;
  /**
   * Between 1-255 characters
   */
  document_title: string | null;

  end_page_number: number;
  /**
   * Has to be bigger than 0
   */
  start_page_number: number;

  type: "page_location"
}

interface ContentBlockCitation {
  cited_text: string;
  /**
   * Bigger than 0
   */
  document_index: number;
  /**
   * Between 1-255 characters
   */
  document_title: string | null;

  end_block_index: number;
  /**
   * Has to be bigger than 0
   */
  start_block_index: number;

  type: "content_block_location"
}

interface WebSearchResultCitation {
  cited_text: string;

  encrypted_index: number;
  /**
   * Between 1-512 characters
   */
  title: string | null;
  /**
   * Required length between 1-2048 characters
   */
  url: string
  type: "web_search_result_location"
}

interface RequestSearchResultLocation {
  cited_text: string;

  end_block_index: number;
  /**
   * Has to be bigger than 0
   */
  start_block_index: number;
  /**
   * Bigger than 0
   */
  search_result_index: number;

  source: string;
  /**
   * Between 1-512 characters
   */
  title: string | null;

  type: "search_result_location"
}


interface MCPServer {
  name: string;
  url: string;
  type: "url"
  authorization_token?: string | null;
  tool_configuration: {
    allowed_tools?: string[] | null;
    enabled?: boolean | null;
  } | null;
}



export const validateMaxTokens = (options: TextProviderOptions) => {
  if (options.max_tokens < 1) {
    throw new Error("max_tokens must be at least 1.");
  }
} 