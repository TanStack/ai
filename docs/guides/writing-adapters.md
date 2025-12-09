---
title: Writing Adapters
id: writing-adapters
---

# Writing a new adapter for TanStack AI guide

Each of our adapter tries to follow the same structure, and first thing you want to do
is copy/paste one of the adapter folders and rename it, eg (`ai-gemini` => `ai-your-adapter`).

Then change the `package.json` fields accordingly and remove the CHANGELOG.md, the files in the
`tests` folder and let's go step by step from there.

## model-meta.ts

This file is responsible for generating the `per-model` typesafety. It always starts with a `ModelMeta` interface on top that defines the following unified structure across adapters:
```ts
interface ModelMeta<TProviderOptions = unknown> {
  name: string
  supports: {
    input: Array<'text' | 'image' | 'audio' | 'video' | 'document'>
    output: Array<'text' | 'image' | 'audio' | 'video'> 
  }
  max_input_tokens?: number
  max_output_tokens?: number
  knowledge_cutoff?: string
  pricing?: {
    input: {
      normal: number
      cached?: number
    }
    output: {
      normal: number
    }
  }
  /**
   * Type-level description of which provider options this model supports.
   */
  providerOptions?: TProviderOptions
}
```

This will be your general interface to work with and you can define the capabilities of each model freely as you'd like, for example here is the definition for gemini:

```ts
interface ModelMeta<TProviderOptions = unknown> {
  //...
  supports: { 
    //...
    capabilities?: Array<
      | 'audio_generation'
      | 'batch_api'
      | 'caching'
      | 'code_execution'
      | 'file_search'
      | 'function_calling'
      | 'grounding_with_gmaps'
      | 'image_generation'
      | 'live_api'
      | 'search_grounding'
      | 'structured_output'
      | 'thinking'
      | 'url_context'
    >
  } 
}
```

This usually maps to some sort of a table of supported functionalities found on the documentation websites of the original adapters, some have it under capabilities, some have it in tables, some have it spread across multiple doc pages, this will be very individual on how you extract this information but it's important for current and future features to offer ultimate type-safety on a per model basis.

Once you've mapped the interface from above you are going to go model by model and write down what each one supports, eg:
```ts
const GEMINI_3_PRO = {
  name: 'gemini-3-pro-preview',
  max_input_tokens: 1_048_576,
  max_output_tokens: 65_536,
  knowledge_cutoff: '2025-01-01',
  supports: {
    input: ['text', 'image', 'audio', 'video', 'document'],
    output: ['text'],
    capabilities: [
      'batch_api',
      'caching',
      'code_execution',
      'file_search',
      'function_calling',
      'search_grounding',
      'structured_output',
      'thinking',
      'url_context',
    ],
  },
  pricing: {
    input: {
      normal: 2.5,
    },
    output: {
      normal: 15,
    },
  },
} as const satisfies ModelMeta<
  GeminiToolConfigOptions &
    GeminiSafetyOptions &
    GeminiGenerationConfigOptions &
    GeminiCachedContentOptions &
    GeminiStructuredOutputOptions &
    GeminiThinkingOptions
>
```

The important part to note is the end here where we cast it with `as const` and then do a satisfies `ModelMeta<ProviderOptions>`, this tells the type system what provider options each model supports.
For now leave it as `any` until we get back to it a little bit later.

Once you've mapped all the models the provider supports you are going to create an array of models like so:
```ts
export const GEMINI_MODELS = [
  GEMINI_3_PRO.name,
  GEMINI_2_5_PRO.name,
  GEMINI_2_5_FLASH.name,
  GEMINI_2_5_FLASH_PREVIEW.name,
  GEMINI_2_5_FLASH_LITE.name,
  GEMINI_2_5_FLASH_LITE_PREVIEW.name,
  GEMINI_2_FLASH.name,
  GEMINI_2_FLASH_LITE.name,
] as const
```

Then we create a per model providerOptions mapping type:
```ts
export type GeminiChatModelProviderOptionsByName = {
  // Models with thinking and structured output support
  [GEMINI_3_PRO.name]: GeminiToolConfigOptions &
    GeminiSafetyOptions &
    GeminiGenerationConfigOptions &
    GeminiCachedContentOptions &
    GeminiStructuredOutputOptions &
    GeminiThinkingOptions
  [GEMINI_2_5_PRO.name]: GeminiToolConfigOptions &
    GeminiSafetyOptions &
    GeminiGenerationConfigOptions &
    GeminiCachedContentOptions &
    GeminiStructuredOutputOptions &
    GeminiThinkingOptions
  // ... rest of models and what they support
}
```

And then the input modalities type:
```ts
export type GeminiModelInputModalitiesByName = {
  // Models with full multimodal support (text, image, audio, video, document)
  [GEMINI_3_PRO.name]: typeof GEMINI_3_PRO.supports.input
  [GEMINI_2_5_PRO.name]: typeof GEMINI_2_5_PRO.supports.input
  [GEMINI_2_5_FLASH_LITE.name]: typeof GEMINI_2_5_FLASH_LITE.supports.input
  [GEMINI_2_5_FLASH_LITE_PREVIEW.name]: typeof GEMINI_2_5_FLASH_LITE_PREVIEW.supports.input

  // Models with text, image, audio, video (no document)
  [GEMINI_2_5_FLASH.name]: typeof GEMINI_2_5_FLASH.supports.input
  [GEMINI_2_5_FLASH_PREVIEW.name]: typeof GEMINI_2_5_FLASH_PREVIEW.supports.input
  [GEMINI_2_FLASH.name]: typeof GEMINI_2_FLASH.supports.input
  [GEMINI_2_FLASH_LITE.name]: typeof GEMINI_2_FLASH_LITE.supports.input
}
```

We are officially done with `model-meta.ts` at this point, we just need to plug these into the adapter.

We import them into the adapter file and do something like the following:
```ts
import type {
  GeminiChatModelProviderOptionsByName,
  GeminiModelInputModalitiesByName,
} from './model-meta'
import { GEMINI_EMBEDDING_MODELS, GEMINI_MODELS } from './model-meta'
type GeminiProviderOptions = {}

export class GeminiAdapter extends BaseAdapter<
  // plug in the models for chat
  typeof GEMINI_MODELS,
  // plug in the models for embeddings
  typeof GEMINI_EMBEDDING_MODELS,
  // chat provider options
  GeminiProviderOptions,
  // embedding provider options
  Record<string, any>,
  // provider options per model typesafety
  GeminiChatModelProviderOptionsByName,
  // input modalities per model
  GeminiModelInputModalitiesByName,
  // modality metadata
  GeminiMessageMetadataByModality
>
```

## message-types.ts

Second file that we're going over is the file responsible for
adding additional context on a per message basis. This allows users
to add stuff like caching information per message, image types and things of that nature.

You define the types per each modality (text, image, audio, video and document) and then export an interface with those options:
```ts
export interface GeminiMessageMetadataByModality {
  text: GeminiTextMetadata
  image: GeminiImageMetadata
  audio: GeminiAudioMetadata
  video: GeminiVideoMetadata
  document: GeminiDocumentMetadata
}
```

Here's how you define that with a full example through gemini:

```ts

/**
 * Metadata for Gemini image content parts.
 */
export interface GeminiImageMetadata { 
  mimeType?: GeminiImageMimeType
}

/**
 * Metadata for Gemini audio content parts.
 */
export interface GeminiAudioMetadata { 
  mimeType?: GeminiAudioMimeType
}

/**
 * Metadata for Gemini video content parts.
 */
export interface GeminiVideoMetadata { 
  mimeType?: GeminiVideoMimeType
}

/**
 * Metadata for Gemini document content parts.
 */
export interface GeminiDocumentMetadata { 
  mimeType?: GeminiDocumentMimeType
}

/**
 * Metadata for Gemini text content parts.
 * Currently no specific metadata options for text in Gemini.
 */
export interface GeminiTextMetadata {}

/**
 * Map of modality types to their Gemini-specific metadata types.
 * Used for type inference when constructing multi-modal messages.
 */
export interface GeminiMessageMetadataByModality {
  text: GeminiTextMetadata
  image: GeminiImageMetadata
  audio: GeminiAudioMetadata
  video: GeminiVideoMetadata
  document: GeminiDocumentMetadata
}
```

Then you finally plug it into the adapter:
```ts
import type { 
  GeminiMessageMetadataByModality, 
} from './message-types'

export class GeminiAdapter extends BaseAdapter<
  // plug in the models for chat
  typeof GEMINI_MODELS,
  // plug in the models for embeddings
  typeof GEMINI_EMBEDDING_MODELS,
  // chat provider options
  GeminiProviderOptions,
  // embedding provider options
  Record<string, any>,
  // provider options per model typesafety
  GeminiChatModelProviderOptionsByName,
  // input modalities per model
  GeminiModelInputModalitiesByName,
  // modality metadata goes here
  GeminiMessageMetadataByModality
>
```

## text-provider-options.ts

This file is usually located under the `text` folder and contains
all the provider options that the specific provider offers. These files will have the biggest differences between providers as this is very tied to the offering. The important thing and structure you need to figure out is:
1. what are the general options that every model supports
2. what are the individual model features that some support and some don't

After you figure these two things you can create a generic `BaseProviderOptions` and then the more specific ones like `ToolConfigOptions`. 

After you've done this you will import this into the `model-meta.ts` and use these "chunks" of interfaces to construct the final `providerOptions` for each model, refer to the examples above where we pass in specific Gemini chunks to create the final interface.

We usually recommend using the types provided from the SDK to type the values as it's easier than writing it out by hand. Try to add JSDOC and make it easier for end users to consume.

Another thing you'll need to do in this file is export all the providerOptions fused into a single type, eg:
```ts
export type ExternalTextProviderOptions = GeminiToolConfigOptions &
  GeminiSafetyOptions &
  GeminiGenerationConfigOptions &
  GeminiCachedContentOptions
```

And then import them in the adapter and consume them:

```ts

import type { ExternalTextProviderOptions } from './text/text-provider-options'

export type GeminiProviderOptions = ExternalTextProviderOptions

export class GeminiAdapter extends BaseAdapter<
  typeof GEMINI_MODELS,
  typeof GEMINI_EMBEDDING_MODELS,
  // add them here
  GeminiProviderOptions,
  Record<string, any>,
  GeminiChatModelProviderOptionsByName,
  GeminiModelInputModalitiesByName,
  GeminiMessageMetadataByModality
>{}
```

## Writing the adapter

Now that we have all our types in order, all that is left to do is write out the adapter logic. In the constructor you will take in config tied to the adapter, for example the apiKey, the region, baseUrl and things like that.

If you're using an SDK to communicate to the provider you initialize it here and set it into the client.
```ts
  constructor(config: GeminiAdapterConfig) {
    super(config)
    this.client = new GoogleGenAI({
      apiKey: config.apiKey,
    })
  }
```

After that you will implement the methods required by the BaseAdapter to interact with the provider's API.

The `chatStream` method is your main one and we usually have the following structure:

```ts
class YourAdapter extends BaseAdapter {


  async *chatStream(
    // these types come from @tanstack/ai
     options: ChatOptions<string, SpecificProviderOptions>,
    // // these types come from @tanstack/ai
   ): AsyncIterable<StreamChunk> {
     // Map common options to provider format
     const mappedOptions = this.mapCommonOptionsToProvider(options)
    // call the API of the provider
     const result =
       await this.client.models.generateContentStream(mappedOptions)
    // extract the streaming into it's own function
     yield* this.processStreamChunks(result, options.model)
   }
}

```

The idea is:
1. map the TanStack AI common options into provider-specific options
2. Call the API
3. Map the provider response into TanStack AI's common response format

Once you've implemented all the methods all that's left to do is create the two utility methods:
1. createYourAdapterHere - accepts the API key and returns an instance of the adapter
2. yourAdapterHere - extracts the API key from the process/window or throws

Here's an example with gemini:

```ts
/**
 * Creates a Gemini adapter with simplified configuration
 * @param apiKey - Your Google API key
 * @returns A fully configured Gemini adapter instance
 *
 * @example
 * ```typescript
 * const gemini = createGemini("AIza...");
 *
 * const ai = new AI({
 *   adapters: {
 *     gemini,
 *   }
 * });
 * ```
 */
export function createGemini(
  apiKey: string,
  config?: Omit<GeminiAdapterConfig, 'apiKey'>,
): GeminiAdapter {
  return new GeminiAdapter({ apiKey, ...config })
}

/**
 * Create a Gemini adapter with automatic API key detection from environment variables.
 *
 * Looks for `GOOGLE_API_KEY` or `GEMINI_API_KEY` in:
 * - `process.env` (Node.js)
 * - `window.env` (Browser with injected env)
 *
 * @param config - Optional configuration (excluding apiKey which is auto-detected)
 * @returns Configured Gemini adapter instance
 * @throws Error if API key is not found in environment
 *
 * @example
 * ```typescript
 * // Automatically uses GOOGLE_API_KEY or GEMINI_API_KEY from environment
 * const aiInstance = ai(gemini());
 * ```
 */
export function gemini(
  config?: Omit<GeminiAdapterConfig, 'apiKey'>,
): GeminiAdapter {
  const env =
    typeof globalThis !== 'undefined' && (globalThis as any).window?.env
      ? (globalThis as any).window.env
      : typeof process !== 'undefined'
        ? process.env
        : undefined
  const key = env?.GOOGLE_API_KEY || env?.GEMINI_API_KEY

  if (!key) {
    throw new Error(
      'GOOGLE_API_KEY or GEMINI_API_KEY is required. Please set it in your environment variables or use createGemini(apiKey, config) instead.',
    )
  }

  return createGemini(key, config)
}

```