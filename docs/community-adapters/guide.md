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

Community adapters are **not maintained by the core TanStack AI team**, and can be reused across different projects.

## Creating a Community Adapter

Follow the steps below to build a well-structured, type-safe adapter.

### 1. Set up your project

Start by reviewing the [existing internal adapter implementations in the TanStack AI GitHub repository](https://github.com/tanstack/ai/tree/main/packages/typescript). These define the expected structure, conventions, and integration patterns.

For a complete, detailed reference, use the [OpenAI adapter](https://github.com/tanstack/ai/tree/main/packages/typescript/ai-openai), which is the most fully featured implementation.

### 2. Define model metadata

Model metadata describes each model’s capabilities and constraints and is used by TanStack AI for compatibility checks and feature selection.

Your metadata should define, at a minimum:

- Model name and identifier
- Supported input and output modalities
- Supported features (e.g. streaming, tools, structured output)
- Pricing or cost information (if available)
- Any provider-specific notes or limitations

Refer to the [OpenAI adapter’s model metadata](https://github.com/TanStack/ai/blob/main/packages/typescript/ai-openai/src/model-meta.ts) for a concrete example.

### 3. Define model capability arrays 

After defining metadata, group models by supported functionality using exported arrays. These arrays allow TanStack AI to automatically select compatible models for a given task.

Example:
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
Each array should only include models that fully support the associated functionality.

### 4. Define model provider options

Each model exposes a different set of configurable options. These options must be typed per model name so that users only see valid configuration options.

Example:
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
This ensures strict type safety and feature correctness at compile time.

### 5. Define supported input modalities

Models typically support different input modalities (e.g. text, images, audio). These must be defined per model to prevent invalid usage.

Example:
```typescript
export type OpenAIModelInputModalitiesByName = {
  [GPT5_2.name]: typeof GPT5_2.supports.input
  [GPT5_2_PRO.name]: typeof GPT5_2_PRO.supports.input
  [GPT5_2_CHAT.name]: typeof GPT5_2_CHAT.supports.input
  //  ... repeat for each model
}
```

### 6. Define model option fragments

Model options should be composed from reusable fragments rather than duplicated per model.

A common pattern is:
- Base options shared by all models
- Feature fragments that are stitched together per model

Example (based on [OpenAI models](https://github.com/TanStack/ai/blob/main/packages/typescript/ai-openai/src/text/text-provider-options.ts)):
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


Models can then opt into only the features they support:

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

### 8. Publish and submit a PR

Once your adapter is complete:
1. Publish it as an npm package
2. Open a PR to the [TanStack AI repository](https://github.com/TanStack/ai/pulls)
3. Add your adapter to the [Community Adapters list in the documentation](https://github.com/TanStack/ai/tree/main/docs/community-adapters)

### 9. Sync documentation configuration

After adding your adapter, run the  `pnpm run sync-docs-config` in the root of the TanStack AI monorepo. This ensures your adapter appears correctly in the documentation navigation. Open a PR with the generated changes.

### 10. Maintain your adapter

As a community adapter author, you are responsible for ongoing maintenance.

This includes:

- Tracking upstream provider API changes
- Keeping compatibility with TanStack AI releases
- Addressing issues and feedback from users
- Updating documentation when features change

If you add new features or breaking changes, open a follow-up PR to keep the docs in sync.