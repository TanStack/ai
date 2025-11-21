
import { GeminiChatModels } from "../model-meta";
import { Schema } from "../tools/function-declaration-tool";
import { GoogleGeminiTool } from "../tools";
import { ContentListUnion, MediaResolution, SafetySetting, ThinkingLevel, ToolConfig } from "@google/genai";

export interface ExternalTextProviderOptions {

  /**
   * Tool configuration for any Tool specified in the request.
   */
  toolConfig?: ToolConfig
  /**
   *  list of unique SafetySetting instances for blocking unsafe content.

This will be enforced on the GenerateContentRequest.contents and GenerateContentResponse.candidates. There should not be more than one setting for each SafetyCategory type. The API will block any contents and responses that fail to meet the thresholds set by these settings. This list overrides the default settings for each SafetyCategory specified in the safetySettings. If there is no SafetySetting for a given SafetyCategory provided in the list, the API will use the default safety setting for that category. Harm categories HARM_CATEGORY_HATE_SPEECH, HARM_CATEGORY_SEXUALLY_EXPLICIT, HARM_CATEGORY_DANGEROUS_CONTENT, HARM_CATEGORY_HARASSMENT, HARM_CATEGORY_CIVIC_INTEGRITY are supported
   */
  safetySettings?: SafetySetting[]

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
      thinkingLevel?: ThinkingLevel
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
    mediaResolution?: MediaResolution
  }
  /**
   * The name of the content cached to use as context to serve the prediction. Format: cachedContents/{cachedContent}
   */
  cachedContent?: `cachedContents/${string}`;
}
export interface InternalTextProviderOptions extends ExternalTextProviderOptions {
  // path parameter
  model: GeminiChatModels;
  /**
 * Developer set system instruction(s). 
 */
  systemInstruction?: string;
  /**
   * The content of the current conversation with the model.

For single-turn queries, this is a single instance. For multi-turn queries like chat, this is a repeated field that contains the conversation history and the latest request.
   */
  contents: string | ContentListUnion;
  /**
   * A list of Tools the Model may use to generate the next response.
   * A Tool is a piece of code that enables the system to interact with external systems to perform an action, or set of actions, outside of knowledge and scope of the Model. Supported Tools are Function and codeExecution. 
   */
  tools?: GoogleGeminiTool[];


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
      thinkingLevel?: ThinkingLevel
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
    mediaResolution?: MediaResolution
  }

}


