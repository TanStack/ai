import { AnthropicTool } from "../tools";

interface TextProviderOptions {
  headers?: Record<string, string> & {
    /**
     * Optional header to specify the beta version(s) you want to use.

To use multiple betas, use a comma separated list like beta1,beta2 or specify the header multiple times for each beta.
     */
    "anthropic-beta"?: string[]
    /**
     * The version of the Claude API you want to use.
     * @example "2023-06-01"
     */
    "anthropic-version"?: string

  };

  model: string;

  messages: { content: string | AnthropicTextMessage | AnthropicImageMessage, role: "user" | "assistant" | "developer" | "system" }[]

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
  context_management?: {
    edits?: (ClearToolUses | ClearThinking)[]
  } | null
  /**
   * MCP servers to be utilized in this request
   * Maximum of 20 servers
   */
  mcp_servers?: MCPServer[]

  metadata?: Record<string, any> & {
    /** 
     * A unique identifier for the end-user, to help with monitoring and abuse detection. 
     * Maximum length 256 characters.
     */
    user_id?: string | null
  };
  /**
   * Determines whether to use priority capacity (if available) or standard capacity for this request.
   */
  service_tier?: "auto" | "standard_only"
  /**
   * Custom text sequences that will cause the model to stop generating.

Anthropic models will normally stop when they have naturally completed their turn, which will result in a response stop_reason of "end_turn".

If you want the model to stop generating when it encounters custom strings of text, you can use the stop_sequences parameter. If the model encounters one of the custom sequences, the response stop_reason value will be "stop_sequence" and the response stop_sequence value will contain the matched stop sequence.
   */
  stop_sequences?: string[] | null;
  /**
   * Whether to incrementally stream the response using server-sent events.
   */
  stream?: boolean;
  /**
    * stem prompt.
 
 A system prompt is a way of providing context and instructions to Claude, such as specifying a particular goal or role.
    */
  system?: string | {
    type: "text",
    /**
     * Bigger than 0
     */
    text: string
    /**
     * Create a cache control breakpoint at this content block.
     */
    cache_control?: CacheControl | null

    citations?: Citation[]



  }
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

  tool_choice?: {
    type: "auto" | "any",
    /**
     * Defaults to false. If set to true, the model will output at most one tool use or exactly one call on type: "any".
     */
    disable_parallel_tool_use?: boolean
  } | {
    /**
     * Name of the tool to use
     */
    name: string
    type: "tool",
    /**
     * Whether to disable parallel tool use.

Defaults to false. If set to true, the model will output exactly one tool use.
     */
    disable_parallel_tool_use?: boolean
  } | {
    type: "none"
  }

  tools?: AnthropicTool[]
  /**
   * Only sample from the top K options for each subsequent token.

Used to remove "long tail" low probability responses.
Recommended for advanced use cases only. You usually only need to use temperature.

Required range: x >= 0
   */
  top_k?: number | null;
  /**
   * Use nucleus sampling.

In nucleus sampling, we compute the cumulative distribution over all the options for each subsequent token in decreasing probability order and cut it off once it reaches a particular probability specified by top_p. You should either alter temperature or top_p, but not both.
   */
  top_p?: number | null;
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

export const validateContextManagement = (options: TextProviderOptions) => {
  const contextManagement = options.context_management;
  if (contextManagement?.edits) {
    if (contextManagement.edits.some(edit => {
      edit.keep && edit.keep.value < 1
    })) {
      throw new Error("context_management.edits.keep.value must be greater than 0.");
    }
  }
}

export const validateMetadata = (options: TextProviderOptions) => {
  if (options.metadata?.user_id && options.metadata.user_id.length > 256) {
    throw new Error("metadata.user_id cannot be longer than 256 characters.");
  }
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

interface ClearThinking {
  type: "clear_thinking_202501015"
  keep?: {
    type: "thinking_turns",
    /** Bigger than 0 */
    value: number
  }
}

interface ClearToolUses {
  type: "clear_tool-uses_20250919"
  /**
   * Minimum number of tokens that must be cleared when triggered. Context will only be modified if at least this many tokens can be removed.
   */
  clear_at_least?: {
    type: "input_tokens",
    /**
     * Bigger than 0
     */
    value: number
  } | null

  /**
   * Whether to clear all tool inputs (bool) or specific tool inputs to clear (list)
   */
  clear_tool_inputs?: boolean | null;
  /**
   * Tool names whose uses are preserved from clearing
   */
  exclude_tools?: string[] | null;
  /**
   * Number of tool uses to retain in the conversation
   */
  keep?: {
    type: "tool_uses",
    /**
     * Bigger than 0
     */
    value: number
  }
  /**
   * Condition that triggers the context management strategy
   */
  trigger?: {
    type: "input_tokens"
    /**
     * Bigger than 0
     */
    value: number
  } | {
    type: "tool_uses",
    /**
     * Bigger than 0
     */
    value: number
  }
}

export const validateMaxTokens = (options: TextProviderOptions) => {
  if (options.max_tokens < 1) {
    throw new Error("max_tokens must be at least 1.");
  }
}

interface AnthropicTextMessage {
  type: "text"
  text: string
}

interface AnthropicImageMessage {
  type: "image"
  source: {
    type: "base64",
    media_type: "image/jpeg" | "image/png" | "image/webp" | "image/gif",
    data: string
  } | {
    type: "url",
    url: string
  }
}