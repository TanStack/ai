import { FunctionDeclarationsTool } from "@google/generative-ai";
import { GeminiChatModels } from "../model-meta";
import { CodeExecutionTool } from "../tools/code-execution-tool";
import { ComputerUseTool } from "../tools/computer-use-tool";
import { FileSearchTool } from "../tools/file-search-tool";
import { GoogleMapsTool } from "../tools/google-maps-tool";
import { GoogleSearchRetrievalTool } from "../tools/google-search-retriveal-tool";
import { GoogleSearchTool } from "../tools/google-search-tool";
import { UrlContextTool } from "../tools/url-context-tool";
import { Schema } from "../tools/function-declaration-tool";

export interface TextProviderOptions {
  // path parameter
  model: GeminiChatModels;
  /**
   * The content of the current conversation with the model.

For single-turn queries, this is a single instance. For multi-turn queries like chat, this is a repeated field that contains the conversation history and the latest request.
   */
  contents: string | {
    role: "user" | "model";
    parts: (TextPart | InlineDataPart | FunctionCallPart | FunctionResponsePart | FileDataPart | ExecutableCodePart | CodeExecutionResultPart)[]
  }[];
  /**
   * A list of Tools the Model may use to generate the next response.
   * A Tool is a piece of code that enables the system to interact with external systems to perform an action, or set of actions, outside of knowledge and scope of the Model. Supported Tools are Function and codeExecution. 
   */
  tools?: CodeExecutionTool | ComputerUseTool | FileSearchTool | FunctionDeclarationsTool | GoogleMapsTool | GoogleSearchRetrievalTool | GoogleSearchTool | UrlContextTool[]
  /**
   * Tool configuration for any Tool specified in the request.
   */
  toolConfig?: {
    functionCallingConfig?: {
      /**
       * - MODE_UNSPECIFIED	Unspecified function calling mode. This value should not be used.
  - AUTO	Default model behavior, model decides to predict either a function call or a natural language response.
  - ANY	Model is constrained to always predicting a function call only. If "allowedFunctionNames" are set, the predicted function call will be limited to any one of "allowedFunctionNames", else the predicted function call will be any one of the provided "functionDeclarations".
  - NONE	Model will not predict any function call. Model behavior is same as when not passing any function declarations.
  - VALIDATED	Model decides to predict either a function call or a natural language response, but will validate function calls with constrained decoding. If "allowedFunctionNames" are set, the predicted function call will be limited to any one of "allowedFunctionNames", else the predicted function call will be any one of the provided "functionDeclarations".
       */
      mode?: "MODE_UNSPECIFIED" | "AUTO" | "ANY" | "NONE" | "VALIDATED";
      /**
       * A set of function names that, when provided, limits the functions the model will call.
       * This should only be set when the Mode is ANY or VALIDATED. Function names should match [FunctionDeclaration.name]. When set, model will predict a function call from only allowed function names.
       */
      allowedFunctionNames?: string[];
    }

    retrievalConfig?: {
      /**
       * The location of the user.
       */
      latLng?: {
        /**
         * It must be in the range [-90.0, +90.0].
         */
        latitude: number;
        /**
         * It must be in the range [-180.0, +180.0].
         */
        longitude: number;
      }
      /**
       * The language code of the user. Language code for content. Use language tags defined by BCP47.
       */
      languageCode?: string;
    }
  }
  /**
   *  list of unique SafetySetting instances for blocking unsafe content.

This will be enforced on the GenerateContentRequest.contents and GenerateContentResponse.candidates. There should not be more than one setting for each SafetyCategory type. The API will block any contents and responses that fail to meet the thresholds set by these settings. This list overrides the default settings for each SafetyCategory specified in the safetySettings. If there is no SafetySetting for a given SafetyCategory provided in the list, the API will use the default safety setting for that category. Harm categories HARM_CATEGORY_HATE_SPEECH, HARM_CATEGORY_SEXUALLY_EXPLICIT, HARM_CATEGORY_DANGEROUS_CONTENT, HARM_CATEGORY_HARASSMENT, HARM_CATEGORY_CIVIC_INTEGRITY are supported
   */
  safetySettings?: {
    category: "HARM_CATEGORY_UNSPECIFIED" | "HARM_CATEGORY_DEROGATORY" | "HARM_CATEGORY_TOXICITY" | "HARM_CATEGORY_VIOLENCE" | "HARM_CATEGORY_SEXUAL" | "HARM_CATEGORY_MEDICAL" | "HARM_CATEGORY_DANGEROUS" | "HARM_CATEGORY_HARASSMENT" | "HARM_CATEGORY_HATE_SPEECH" | "HARM_CATEGORY_SEXUALLY_EXPLICIT" | "HARM_CATEGORY_DANGEROUS_CONTENT" | "HARM_CATEGORY_CIVIC_INTEGRITY";
    threshold: "HARM_BLOCK_THRESHOLD_UNSPECIFIED" | "BLOCK_LOW_AND_ABOVE" | "BLOCK_MEDIUM_AND_ABOVE" | "BLOCK_ONLY_HIGH" | "BLOCK_NONE" | "OFF";
  }[]
  /**
   * Developer set system instruction(s). 
   */
  systemInstruction?: string;
  /**
   * Configuration options for model generation and outputs.
   */
  generationConfig?: {
    /**
     * The set of character sequences (up to 5) that will stop output generation. If specified, the API will stop at the first appearance of a stop_sequence. The stop sequence will not be included as part of the response.
     */
    stopSequences?: string[];
    /**
     * MIME type of the generated candidate text. Supported MIME types are: text/plain: (default) Text output. application/json: JSON response in the response candidates. text/x.enum: ENUM as a string response in the response candidates.
     */
    responseMimeType?: string;
    /**
     * Output schema of the generated candidate text. Schemas must be a subset of the OpenAPI schema and can be objects, primitives or arrays.

If set, a compatible responseMimeType must also be set. Compatible MIME types: application/json: Schema for JSON response.
     */
    responseSchema?: Schema
    /**
     * Output schema of the generated response. This is an alternative to responseSchema that accepts JSON Schema.

If set, responseSchema must be omitted, but responseMimeType is required.

While the full JSON Schema may be sent, not all features are supported. Specifically, only the following properties are supported:

$id
$defs
$ref
$anchor
type
format
title
description
enum (for strings and numbers)
items
prefixItems
minItems
maxItems
minimum
maximum
anyOf
oneOf (interpreted the same as anyOf)
properties
additionalProperties
required
The non-standard propertyOrdering property may also be set.

Cyclic references are unrolled to a limited degree and, as such, may only be used within non-required properties. (Nullable properties are not sufficient.) If $ref is set on a sub-schema, no other properties, except for than those starting as a $, may be set.
     */
    responseJsonSchema?: Schema
    /**
     * The requested modalities of the response. Represents the set of modalities that the model can return, and should be expected in the response. This is an exact match to the modalities of the response.

A model may have multiple combinations of supported modalities. If the requested modalities do not match any of the supported combinations, an error will be returned.
     */
    responseModalities?: ("MODALITY_UNSPECIFIED" | "TEXT" | "IMAGE" | "AUDIO")[]
    /**
     *  Number of generated responses to return. If unset, this will default to 1. Please note that this doesn't work for previous generation models (Gemini 1.0 family)
     */
    candidateCount?: number;
    /**
     * The maximum number of tokens to include in a response candidate.

Note: The default value varies by model, see the Model.output_token_limit attribute of the Model returned from the getModel function.
     */
    maxOutputTokens?: number;
    /**
     * Controls the randomness of the output.

Note: The default value varies by model, see the Model.temperature attribute of the Model returned from the getModel function.

Values can range from [0.0, 2.0].
     */
    temperature?: number;
    /**
     * The maximum cumulative probability of tokens to consider when sampling.

The model uses combined Top-k and Top-p (nucleus) sampling.

Tokens are sorted based on their assigned probabilities so that only the most likely tokens are considered. Top-k sampling directly limits the maximum number of tokens to consider, while Nucleus sampling limits the number of tokens based on the cumulative probability.

Note: The default value varies by Model and is specified by theModel.top_p attribute returned from the getModel function. An empty topK attribute indicates that the model doesn't apply top-k sampling and doesn't allow setting topK on requests.
     */
    topP?: number;
    /**
     * The maximum number of tokens to consider when sampling.

Gemini models use Top-p (nucleus) sampling or a combination of Top-k and nucleus sampling. Top-k sampling considers the set of topK most probable tokens. Models running with nucleus sampling don't allow topK setting.

Note: The default value varies by Model and is specified by theModel.top_p attribute returned from the getModel function. An empty topK attribute indicates that the model doesn't apply top-k sampling and doesn't allow setting topK on requests.
     */
    topK?: number;
    /**
     * Seed used in decoding. If not set, the request uses a randomly generated seed.
     */
    seed?: number;
    /**
     * Presence penalty applied to the next token's logprobs if the token has already been seen in the response.

This penalty is binary on/off and not dependant on the number of times the token is used (after the first). Use frequencyPenalty for a penalty that increases with each use.

A positive penalty will discourage the use of tokens that have already been used in the response, increasing the vocabulary.

A negative penalty will encourage the use of tokens that have already been used in the response, decreasing the vocabulary.
     */
    presencePenalty?: number;
    /**
     * Frequency penalty applied to the next token's logprobs, multiplied by the number of times each token has been seen in the respponse so far.

A positive penalty will discourage the use of tokens that have already been used, proportional to the number of times the token has been used: The more a token is used, the more difficult it is for the model to use that token again increasing the vocabulary of responses.

Caution: A negative penalty will encourage the model to reuse tokens proportional to the number of times the token has been used. Small negative values will reduce the vocabulary of a response. Larger negative values will cause the model to start repeating a common token until it hits the maxOutputTokens limit.
     */
    frequencyPenalty?: number;
    /**
     *  If true, export the logprobs results in response.
     */
    responseLogprobs?: boolean;

    /**
     * Only valid if responseLogprobs=True. This sets the number of top logprobs to return at each decoding step in the Candidate.logprobs_result. The number must be in the range of [0, 20].
     */
    logprobs?: number;

    /**
     *  Enables enhanced civic answers. It may not be available for all models.
     */
    enableEnhancedCivicAnswers?: boolean;

    /**
     * The speech generation config.
     */
    speechConfig?: {
      voiceConfig: {
        prebuiltVoiceConfig: {
          voiceName: string
        }
      }

      multiSpeakerVoiceConfig?: {
        speakerVoiceConfigs?: {
          speaker: string;
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: string
            }
          }
        }[]
      }
      /**
       * Language code (in BCP 47 format, e.g. "en-US") for speech synthesis.

Valid values are: de-DE, en-AU, en-GB, en-IN, en-US, es-US, fr-FR, hi-IN, pt-BR, ar-XA, es-ES, fr-CA, id-ID, it-IT, ja-JP, tr-TR, vi-VN, bn-IN, gu-IN, kn-IN, ml-IN, mr-IN, ta-IN, te-IN, nl-NL, ko-KR, cmn-CN, pl-PL, ru-RU, and th-TH.
       */
      languageCode?: "de-DE" | "en-AU" | "en-GB" | "en-IN" | "en-US" | "es-US" | "fr-FR" | "hi-IN" | "pt-BR" | "ar-XA" | "es-ES" | "fr-CA" | "id-ID" | "it-IT" | "ja-JP" | "tr-TR" | "vi-VN" | "bn-IN" | "gu-IN" | "kn-IN" | "ml-IN" | "mr-IN" | "ta-IN" | "te-IN" | "nl-NL" | "ko-KR" | "cmn-CN" | "pl-PL" | "ru-RU" | "th-TH";
    }
    /**
     * Config for thinking features. An error will be returned if this field is set for models that don't support thinking.
     */
    thinkingConfig?: {
      /**
       * Indicates whether to include thoughts in the response. If true, thoughts are returned only when available.
       */
      includeThoughts: boolean;

      /**
       * The number of thoughts tokens that the model should generate.
       */
      thinkingBudget: number;
      /**
       * The level of thoughts tokens that the model should generate.
       */
      thinkingLevel?: "THINKING_LEVEL_UNSPECIFIED" | "LOW" | "HIGH";
    }
    /**
     * Config for image generation. An error will be returned if this field is set for models that don't support these config options.
     */
    imageConfig?: {
      aspectRatio?: "1:1" | "2:3" | "3:2" | "3:4" | "4:3" | "9:16" | "16:9" | "21:9"
    }
    /**
     * If specified, the media resolution specified will be used.
     */
    mediaResolution?: "MEDIA_RESOLUTION_UNSPECIFIED" | "MEDIA_RESOLUTION_LOW" | "MEDIA_RESOLUTION_MEDIUM" | "MEDIA_RESOLUTION_HIGH";
  }
  /**
   * The name of the content cached to use as context to serve the prediction. Format: cachedContents/{cachedContent}
   */
  cachedContent?: `cachedContents/${string}`;
}


interface Part {
  /**
   *  Indicates if the part is thought from the model.
   */
  thought?: boolean;
  /**
   * An opaque signature for the thought so it can be reused in subsequent requests. A base64-encoded string.
   */
  thoughtSignature?: string;
  /**
   * Custom metadata associated with the Part. Agents using genai.Part as content representation may need to keep track of the additional information. For example it can be name of a file/source from which the Part originates or a way to multiplex multiple Part streams.
   */
  partMetadata?: Record<string, string>;
  /**
   * Media resolution for the input media.
   */
  mediaResolution?: {
    level: "MEDIA_RESOLUTION_UNSPECIFIED" | "MEDIA_RESOLUTION_LOW" | "MEDIA_RESOLUTION_MEDIUM" | "MEDIA_RESOLUTION_HIGH";
  }

  videoMetadata?: {
    /**
     * A duration in seconds with up to nine fractional digits, ending with 's'. Example: "3.5s".
     */
    startOffset?: string;
    /**
     * A duration in seconds with up to nine fractional digits, ending with 's'. Example: "3.5s".
     */
    endOffset?: string;
    /**
     *  The frame rate of the video sent to the model. If not specified, the default value will be 1.0. The fps range is (0.0, 24.0].
     */
    fps?: number;
  }
}

interface TextPart extends Part {
  text: string;
}

interface InlineDataPart extends Part {
  mimeType: string;
  data: string; // base64-encoded string
}

interface FunctionCallPart extends Part {
  functionCall: {
    id?: string;
    name: string;
    args?: Record<string, any>;
  };
}

interface FunctionResponsePart extends Part {
  id?: string;
  name: string;
  /**
   * The function response in JSON object format. Callers can use any keys of their choice that fit the function's syntax to return the function output, e.g. "output", "result", etc. In particular, if the function call failed to execute, the response can have an "error" key to return error details to the model.
   */
  response: Record<string, any>;
  /**
   * Ordered Parts that constitute a function response. Parts may have different IANA MIME types.
   */
  parts?: FunctionResponseSegment[];
  /**
   * Signals that function call continues, and more responses will be returned, turning the function call into a generator. Is only applicable to NON_BLOCKING function calls, is ignored otherwise. If set to false, future responses will not be considered. It is allowed to return empty response with willContinue=False to signal that the function call is finished. This may still trigger the model generation. To avoid triggering the generation and finish the function call, additionally set scheduling to SILENT.
   */
  willContinue?: boolean;
  /**
   * Specifies how the response should be scheduled in the conversation. Only applicable to NON_BLOCKING function calls, is ignored otherwise. Defaults to WHEN_IDLE.
   * @default WHEN_IDLE
   */
  scheduling?: "SILENT" | "SCHEDULING_UNSPECIFIED" | "WHEN_IDLE" | "INTERRUPT";
}

interface FunctionResponseSegment {
  inlineData?: {
    mimeType: string;
    data: string
  }
}

interface FileDataPart extends Part {
  mimeType?: string;
  fileUri: string;
}

interface ExecutableCodePart extends Part {
  /**
   *  Programming language of the code.
   */
  language: "LANGUAGE_UNSPECIFIED" | "PYTHON";
  /**
   * The code to be executed
   */
  code: string;
}

interface CodeExecutionResultPart extends Part {
  /**
   * Outcome of the code execution.
   */
  outcome: "OUTCOME_UNSPECIFIED" | "OUTCOME_OK" | "OUTCOME_FAILED" | "OUTCOME_DEADLINE_EXCEEDED";
  /**
   * Contains stdout when code execution is successful, stderr or other description otherwise.
   */
  output?: string;
}