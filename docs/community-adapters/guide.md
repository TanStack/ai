--- 
title: "Community Adapters Guide"
slug: /community-adapters/guide
order: 1
---

# Community Adapters Guide

This guide explains how to create and contribute community adapters for the TanStack AI ecosystem.

Community adapters extend TanStack AI by integrating external services, APIs, or custom model logic. They are authored and maintained by the community and can be reused across projects.

## What is a Community Adapter?

A community adapter is a reusable module that connects TanStack AI to an external provider or system.

Common use cases include:
- Integrating third-party AI model providers
- Implementing custom inference or routing logic
- Exposing provider-specific tools or capabilities
- Connecting to non-LLM AI services (e.g. images, embeddings, video)

Community adapters are **not maintained by the core TanStack AI team**, but can be and reused across different projects.

## Creating a Community Adapter

To create a community adapter, follow these steps:
### 1. Set up your project

Start by reviewing the [existing internal adapter implementations in the TanStack AI GitHub repository](https://github.com/tanstack/ai/tree/main/packages/typescript). These define the expected structure, conventions, and integration patterns.

For a complete, detailed reference, use the [OpenAI adapter]((https://github.com/tanstack/ai/tree/main/packages/typescript/ai-openai), which is the most fully featured implementation.

### Define model metadata

Model metadata describes each model’s capabilities and constraints and is used by TanStack AI for compatibility checks and feature selection.

Your metadata should define, at a minimum:

- Model name and identifier
- Supported input and output modalities
- Supported features (e.g. streaming, tools, structured output)
- Pricing or cost information (if available)
- Any provider-specific notes or limitations

Refer to the [OpenAI adapter’s model metadata](https://github.com/TanStack/ai/blob/main/packages/typescript/ai-openai/src/model-meta.ts) for a concrete example.

3. **Define the model per functionality arrays**: After you define the model metadata, you need to implement arrays for different functionalities the model supports. Generally you want to do something like this:
```typescript
export const OPENAI_CHAT_MODELS = [
  // Frontier models
  GPT5_2.name,
  GPT5_2_PRO.name,
  GPT5_2_CHAT.name,
  GPT5_1.name,
  GPT5_1_CODEX.name,
  GPT5.name,
  GPT5_MINI.name,
  GPT5_NANO.name,
  GPT5_PRO.name,
  GPT5_CODEX.name,
  // ...other models
] as const
export const OPENAI_IMAGE_MODELS = [
  GPT_IMAGE_1.name,
  GPT_IMAGE_1_MINI.name,
  DALL_E_3.name,
  DALL_E_2.name,
] as const

export const OPENAI_VIDEO_MODELS = [SORA2.name, SORA2_PRO.name] as const
```
4. **Define the model provider options**: Every model has different configuration options that users can set when using the model. After you define the model metadata, you need to implement the provider options the model supports. Generally you want to do something like this:
```typescript
export type OpenAIChatModelProviderOptionsByName = {
  [GPT5_2.name]: OpenAIBaseOptions &
    OpenAIReasoningOptions &
    OpenAIStructuredOutputOptions &
    OpenAIToolsOptions &
    OpenAIStreamingOptions &
    OpenAIMetadataOptions
  [GPT5_2_CHAT.name]: OpenAIBaseOptions &
    OpenAIReasoningOptions &
    OpenAIStructuredOutputOptions &
    OpenAIToolsOptions &
    OpenAIStreamingOptions &
    OpenAIMetadataOptions
  // ... repeat for each model
}

```
5. **Define the model input modalities**: Every model usually supports different input modalities (like text, images, etc). After you define the model metadata, you need to implement the input modalities the model supports. Generally you want to
do something like this:
```typescript
export type OpenAIModelInputModalitiesByName = {
  [GPT5_2.name]: typeof GPT5_2.supports.input
  [GPT5_2_PRO.name]: typeof GPT5_2_PRO.supports.input
  [GPT5_2_CHAT.name]: typeof GPT5_2_CHAT.supports.input
  //  ... repeat for each model
}
```
6. **Define your model options**: After you define the model metadata, you need to implement the model options the model supports. Generally you want to do something like this (you can see an example for OpenAI models [here](https://github.com/TanStack/ai/blob/main/packages/typescript/ai-openai/src/text/text-provider-options.ts)):
```typescript
export interface OpenAIBaseOptions {
  // base options that every chat model supports
}

// Feature fragments that can be stitched per-model 

/**
 * Reasoning options for models  
 */
export interface OpenAIReasoningOptions {
   //...
}
 
/**
 * Structured output options for models.
 */
export interface OpenAIStructuredOutputOptions {
  //...
}
```

What you are going for is very specific to the adapter you are building so there is no one-size-fits-all example here.
But the general rule of thumb is that you have the base options that every model supports and then you have feature fragments that can be stitched together per-model.

Here's an example of one of the gpt models that supports every feature:
```typescript
export type OpenAIChatModelProviderOptionsByName = {
  [GPT5_2.name]: OpenAIBaseOptions &
    OpenAIReasoningOptions &
    OpenAIStructuredOutputOptions &
    OpenAIToolsOptions &
    OpenAIStreamingOptions &
    OpenAIMetadataOptions
}
```

There is no single correct composition; this structure should reflect the capabilities of the provider you are integrating.

### 7. Implement adapter logic

Finally, implement the adapter’s runtime logic.

This includes:
- Sending requests to the external service
- Handling streaming and non-streaming responses
- Mapping provider responses to TanStack AI types
- Enforcing model-specific options and constraints

Adapters are implemented per capability, so only implement what your provider supports:

- Text adapter
- Chat adapter
- Image adapter
- Embeddings adapter
- Video adapter

Refer to the [OpenAI adapter](https://github.com/TanStack/ai/blob/main/packages/typescript/ai-openai/src/adapters/text.ts) for a complete, end-to-end implementation example.

8. **Publish your package and open up a PR**: Once your adapter is complete and tested, you can publish it as an npm package and open up a PR to the [TanStack AI repository](https://github.com/TanStack/ai/pulls) to have it listed in the community adapters section of the documentation. Add it into [here](https://github.com/TanStack/ai/tree/main/docs/community-adapters).

9. **Run the script to configure the docs**: After adding your adapter in make sure to run `pnpm run sync-docs-config` in the root of the TanStack AI monorepo to have your adapter show up in the docs, after that open up a PR to have it merged
and that is it!

10. **Maintain your adapter**: As a community adapter, it's important to keep your adapter up-to-date with any changes in the external service or TanStack AI's APIs. Monitor issues and feedback from users to ensure your adapter remains functional and useful. If you add any changes or new features open up a new PR towards the docs to have them reflected there as well.