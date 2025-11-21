import { ModelMessage } from "@tanstack/ai";
import { ApplyPatchTool } from "../tools/apply-patch-tool";
import { CodeInterpreterTool } from "../tools/code-interpreter-tool";
import { ComputerUseTool } from "../tools/computer-use-tool";
import { CustomTool } from "../tools/custom-tool";
import { FileSearchTool } from "../tools/file-search-tool";
import { FunctionTool } from "../tools/function-tool";
import { ImageGenerationTool } from "../tools/image-generation-tool";
import { LocalShellTool } from "../tools/local-shell-tool";
import { MCPTool } from "../tools/mcp-tool";
import { ShellTool } from "../tools/shell-tool";
import { ToolChoice } from "../tools/tool-choice";
import { WebSearchPreviewTool } from "../tools/web-search-preview-tool";
import { WebSearchTool } from "../tools/web-search-tool";
import OpenAI from "openai";

/**
 * Options your SDK forwards to OpenAI when doing chat/responses.
 * Tip: gate these by model capability in your SDK, not just by presence.
 */
export type ExternalTextProviderOptions = {
  /**

Whether to run the model response in the background. Learn more here:
https://platform.openai.com/docs/api-reference/responses/create#responses_create-background
 @default false
   */
  background?: boolean;
  /**
   * The conversation that this response belongs to. Items from this conversation are prepended to input_items for this response request. Input items and output items from this response are automatically added to this conversation after this response completes.
   * 
   * https://platform.openai.com/docs/api-reference/responses/create#responses_create-conversation
   */
  conversation?: string | { id: string }
  /**
   * https://platform.openai.com/docs/api-reference/responses/create#responses_create-include
   Specify additional output data to include in the model response. Currently supported values are:
  
  web_search_call.action.sources: Include the sources of the web search tool call.
  code_interpreter_call.outputs: Includes the outputs of python code execution in code interpreter tool call items.
  computer_call_output.output.image_url: Include image urls from the computer call output.
  file_search_call.results: Include the search results of the file search tool call.
  message.input_image.image_url: Include image urls from the input message.
  message.output_text.logprobs: Include logprobs with assistant messages.
  reasoning.encrypted_content: Includes an encrypted version of reasoning tokens in reasoning item outputs. This enables reasoning items to be used in multi-turn conversations when using the Responses API statelessly (like when the store parameter is set to false, or when an organization is enrolled in the zero data retention program).
  */
  include?: OpenAI.Responses.ResponseIncludable[];


  /**
   * The maximum number of total calls to built-in tools that can be processed in a response. This maximum number applies across all built-in tool calls, not per individual tool. Any further attempts to call a tool by the model will be ignored.
   * https://platform.openai.com/docs/api-reference/responses/create#responses_create-max_tool_calls
   */
  max_tool_calls?: number;

  /**
   * Set of 16 key-value pairs that can be attached to an object. This can be useful for storing additional information about the object in a structured format, and querying for objects via API or the dashboard.

Keys are strings with a maximum length of 64 characters. Values are strings with a maximum length of 512 characters.
https://platform.openai.com/docs/api-reference/responses/create#responses_create-metadata
   */
  metadata?: Record<string, string>;

  /**
   * https://platform.openai.com/docs/api-reference/responses/create#responses_create-parallel_tool_calls
  * Whether to allow the model to run tool calls in parallel.
  * @default true
   */
  parallel_tool_calls?: boolean;

  /**
   * The unique ID of the previous response to the model. Use this to create multi-turn conversations. Cannot be used in conjunction with conversation.
   * https://platform.openai.com/docs/api-reference/responses/create#responses_create-previous_response_id
  */
  previous_response_id?: string;
  /**
   * Reference to a prompt template and its variables. 
   * https://platform.openai.com/docs/api-reference/responses/create#responses_create-prompt
   */
  prompt?: {
    /**
     * Unique identifier of your prompt, found in the dashboard
     */
    id: string,
    /**
     * A specific version of your prompt (defaults to the "current" version as specified in the dashboard)
     */
    version?: string,
    /**
     * A map of values to substitute in for variables in your prompt. The substitution values can either be strings, or other Response input message types like input_image or input_file
     */
    variables?: Record<string, any>;
  }
  /**
   * Used by OpenAI to cache responses for similar requests to optimize your cache hit rates. Replaces the user field. 
   * https://platform.openai.com/docs/api-reference/responses/create#responses_create-prompt_cache_key
   */
  prompt_cache_key?: string;

  /**
   * The retention policy for the prompt cache. Set to 24h to enable extended prompt caching, which keeps cached prefixes active for longer, up to a maximum of 24 hours
   * https://platform.openai.com/docs/api-reference/responses/create#responses_create-prompt_cache_retention
   */
  prompt_cache_retention?: "in-memory" | "24h";

  /**
  * Reasoning controls for models that support it.
  * Lets you guide how much chain-of-thought computation to spend.
  * https://platform.openai.com/docs/api-reference/responses/create#responses_create-reasoning
  * https://platform.openai.com/docs/guides/reasoning
   */
  reasoning?: {
    /**
     * gpt-5.1 defaults to none, which does not perform reasoning. The supported reasoning values for gpt-5.1 are none, low, medium, and high. Tool calls are supported for all reasoning values in gpt-5.1.
All models before gpt-5.1 default to medium reasoning effort, and do not support none.
The gpt-5-pro model defaults to (and only supports) high reasoning effort.
     */
    effort?: "none" | "minimal" | "low" | "medium" | "high";
  };
  /**
   * A summary of the reasoning performed by the model. This can be useful for debugging and understanding the model's reasoning process
   * https://platform.openai.com/docs/api-reference/responses/create#responses_create-reasoning-summary
   */
  summary?: "auto" | "concise" | "detailed";
  /**
     * A stable identifier used to help detect users of your application that may be violating OpenAI's usage policies. The IDs should be a string that uniquely identifies each user. 
     * https://platform.openai.com/docs/api-reference/responses/create#responses_create-safety_identifier
     */
  safety_identifier?: string;


  /**
   * Specifies the processing type used for serving the request.

If set to 'auto', then the request will be processed with the service tier configured in the Project settings. Unless otherwise configured, the Project will use 'default'.
If set to 'default', then the request will be processed with the standard pricing and performance for the selected model.
If set to 'flex' or 'priority', then the request will be processed with the corresponding service tier.
When not set, the default behavior is 'auto'.
When the service_tier parameter is set, the response body will include the service_tier value based on the processing mode actually used to serve the request. This response value may be different from the value set in the parameter.

https://platform.openai.com/docs/api-reference/responses/create#responses_create-service_tier
@default 'auto'
   */
  service_tier?: "auto" | "default" | "flex" | "priority";

  /**
     * Whether to store the generated model response for later retrieval via API.
     * https://platform.openai.com/docs/api-reference/responses/create#responses_create-store
     * @default true
     */
  store?: boolean;

  /**
   * Options for streaming responses. Only set this when you set stream: true
   */
  stream_options?: {
    /**
     * When true, stream obfuscation will be enabled. Stream obfuscation adds random characters to an obfuscation field on streaming delta events to normalize payload sizes as a mitigation to certain side-channel attacks. These obfuscation fields are included by default, but add a small amount of overhead to the data stream. You can set include_obfuscation to false to optimize for bandwidth if you trust the network links between your application and the OpenAI API.
     */
    include_obfuscation?: boolean;
  };



  /**
   * Configuration options for a text response from the model. Can be plain text or structured JSON data. Learn more:
  https://platform.openai.com/docs/api-reference/responses/create#responses_create-text
   */
  text?: OpenAI.Responses.ResponseTextConfig
  /**
    * Constrains the verbosity of the model's response. Lower values will result in more concise responses, while higher values will result in more verbose responses.
    * https://platform.openai.com/docs/api-reference/responses/create#responses_create-text-verbosity
    */
  verbosity?: "low" | "medium" | "high";
  /**
   * An integer between 0 and 20 specifying the number of most likely tokens to return at each token position, each with an associated log probability.
   * https://platform.openai.com/docs/api-reference/responses/create#responses_create-top_logprobs
   */
  top_logprobs?: number;

  /**
   * The truncation strategy to use for the model response.
  
  auto: If the input to this Response exceeds the model's context window size, the model will truncate the response to fit the context window by dropping items from the beginning of the conversation.
  disabled (default): If the input size will exceed the context window size for a model, the request will fail with a 400 error.
   */
  truncation?: "auto" | "disabled";


  /**
  * Function/tool calling configuration. Supply tool schemas in `tools`
  * and control selection here:
  *  - "auto" | "none" | "required"
  *  - { type: "tool", tool_name: string } (or model-specific shape)
  * https://platform.openai.com/docs/guides/tools/tool-choice
  * https://platform.openai.com/docs/api-reference/introduction (tools array)
  */
  tool_choice?:
  | "auto"
  | "none"
  | "required"
  | ToolChoice;
}


/**
 * Options your SDK forwards to OpenAI when doing chat/responses.
 * Tip: gate these by model capability in your SDK, not just by presence.
 */
export interface InternalTextProviderOptions extends ExternalTextProviderOptions {


  input: string | OpenAI.Responses.ResponseInput
  /**
   * A system (or developer) message inserted into the model's context.

When using along with previous_response_id, the instructions from a previous response will not be carried over to the next response. This makes it simple to swap out system (or developer) messages in new responses.
https://platform.openai.com/docs/api-reference/responses/create#responses_create-instructions
   */
  instructions?: string;
  /**
  * An upper bound for the number of tokens that can be generated for a response, including visible output tokens and reasoning tokens.
  * (Responses API name: max_output_tokens)
  * https://platform.openai.com/docs/api-reference/responses/create#responses_create-max_output_tokens
  */
  max_output_tokens?: number;

  /**
    * The model name (e.g. "gpt-4o", "gpt-5", "gpt-4.1-mini", etc).
    * https://platform.openai.com/docs/api-reference/responses/create#responses_create-model
  */
  model: string;

  /**
   * If set to true, the model response data will be streamed to the client as it is generated using server-sent events. 
   * https://platform.openai.com/docs/api-reference/responses/create#responses_create-stream
   * @default false
   */
  stream?: boolean;

  /**
   *  What sampling temperature to use, between 0 and 2. Higher values like 0.8 will make the output more random, while lower values like 0.2 will make it more focused and deterministic. We generally recommend altering this or top_p but not both.
   * https://platform.openai.com/docs/api-reference/responses/create#responses_create-temperature
   */
  temperature?: number;
  /**
   * An alternative to sampling with temperature, called nucleus sampling, where the model considers the results of the tokens with top_p probability mass. So 0.1 means only the tokens comprising the top 10% probability mass are considered.
   * https://platform.openai.com/docs/api-reference/responses/create#responses_create-top_p
   */
  top_p?: number;
  /**
       * Tools the model may call (functions, web_search, etc).
       * Function tool example:
       *   { type: "function", function: { name, description?, parameters: JSONSchema } }
       * https://platform.openai.com/docs/guides/tools/tool-choice
       * https://platform.openai.com/docs/guides/tools-web-search
       */
  tools?: Array<
    FunctionTool | FileSearchTool | ComputerUseTool | WebSearchTool | MCPTool | CodeInterpreterTool | ImageGenerationTool | ShellTool | LocalShellTool | CustomTool | WebSearchPreviewTool | ApplyPatchTool
  >;

}


export const validateConversationAndPreviousResponseId = (
  options: InternalTextProviderOptions
) => {
  if (options.conversation && options.previous_response_id) {
    throw new Error(
      "Cannot use both 'conversation' and 'previous_response_id' in the same request."
    );
  }
};

export const validateMetadata = (options: InternalTextProviderOptions) => {
  const metadata = options.metadata;
  const tooManyKeys = metadata && Object.keys(metadata).length > 16;
  if (tooManyKeys) {
    throw new Error("Metadata cannot have more than 16 key-value pairs.");
  }
  const keyTooLong = metadata && Object.keys(metadata).some(key => key.length > 64);
  if (keyTooLong) {
    throw new Error("Metadata keys cannot be longer than 64 characters.");
  }
  const valueTooLong = metadata && Object.values(metadata).some(value => value.length > 512);
  if (valueTooLong) {
    throw new Error("Metadata values cannot be longer than 512 characters.");
  }
};

export function convertMessagesToInput(messages: ModelMessage[]): OpenAI.Responses.ResponseInput {
  const result: OpenAI.Responses.ResponseInput = [];

  for (const message of messages) {

    // Handle tool messages - convert to FunctionToolCallOutput
    if (message.role === "tool") {
      result.push({
        type: "function_call_output",
        call_id: message.toolCallId || "",
        output: typeof message.content === "string" ? message.content : JSON.stringify(message.content)
      });
      continue;
    }

    // Handle assistant messages
    if (message.role === "assistant") {
      // If the assistant message has tool calls, add them as FunctionToolCall objects
      // OpenAI Responses API expects arguments as a string (JSON string)
      if (message.toolCalls && message.toolCalls.length > 0) {
        for (const toolCall of message.toolCalls) {
          // Keep arguments as string for Responses API
          // Our internal format stores arguments as a JSON string, which is what API expects
          const argumentsString = typeof toolCall.function.arguments === "string"
            ? toolCall.function.arguments
            : JSON.stringify(toolCall.function.arguments || {});
          
          result.push({
            type: "function_call",
            call_id: toolCall.id,
            name: toolCall.function.name,
            arguments: argumentsString
          } as any);
        }
      }

      // Add the assistant's text message if there is content
      if (message.content) {
        result.push({
          type: "message",
          role: "assistant",
          content: [
            {
              type: "input_text",
              text: message.content
            }
          ]
        });
      }

      continue;
    }

    // Handle system messages
    if (message.role === "system") {
      result.push({
        type: "message",
        role: "system",
        content: [
          {
            type: "input_text",
            text: message.content || ""
          }
        ]
      });
      continue;
    }

    // Handle user messages (default case)
    result.push({
      type: "message",
      role: "user",
      content: [
        {
          type: "input_text",
          text: message.content || ""
        }
      ]
    });
  }

  return result;
}
