---
title: "Community Adapters Guide"
slug: /community-adapters/guide
order: 1
description: "Build and publish a community adapter — package layout, model metadata, capability typing, npm + docs PR."
keywords:
  - tanstack ai
  - community adapters
  - build adapter
  - custom adapter
  - provider integration
  - adapter authoring
  - contribute
---

# Community Adapters Guide

If you need a provider TanStack AI does not ship → implement an activity adapter, publish to npm, PR the docs list.

Community adapters are community-maintained (not core team).

## Steps

1. **Study existing adapters** — [packages/](https://github.com/tanstack/ai/tree/main/packages); full reference: [OpenAI adapter](https://github.com/tanstack/ai/tree/main/packages/ai-openai).
2. **Define model metadata** — name/id, input/output modalities, features (stream, tools, structured output), pricing if known, provider limits. Example: [model-meta.ts](https://github.com/TanStack/ai/blob/main/packages/ai-openai/src/model-meta.ts).
3. **Export capability arrays** — only models that fully support each activity:

```typescript ignore
export const OPENAI_CHAT_MODELS = [
  GPT5_2.name,
  GPT5_2_PRO.name,
  // ...
] as const
export const OPENAI_IMAGE_MODELS = [GPT_IMAGE_1.name, DALL_E_3.name] as const
export const OPENAI_VIDEO_MODELS = [SORA2.name, SORA2_PRO.name] as const
```

4. **Type options per model** — map model name → option fragments:

```typescript ignore
export type OpenAIChatModelProviderOptionsByName = {
  [GPT5_2.name]: OpenAIBaseOptions &
    OpenAIReasoningOptions &
    OpenAIStructuredOutputOptions &
    OpenAIToolsOptions &
    OpenAIStreamingOptions &
    OpenAIMetadataOptions
  // repeat per model
}
```

5. **Type input modalities per model**:

```typescript ignore
export type OpenAIModelInputModalitiesByName = {
  [GPT5_2.name]: typeof GPT5_2.supports.input
  [GPT5_2_PRO.name]: typeof GPT5_2_PRO.supports.input
  // ...
}
```

## Option fragments

Compose reusable pieces (base + feature) rather than duplicating per model. Example: [text-provider-options.ts](https://github.com/TanStack/ai/blob/main/packages/ai-openai/src/text/text-provider-options.ts).

```typescript
export interface OpenAIBaseOptions {
  // shared by all chat models
}

export interface OpenAIReasoningOptions {
  // ...
}

export interface OpenAIStructuredOutputOptions {
  // ...
}
```

## Runtime logic

Implement only capabilities your provider supports:

- Text / chat
- Image / embeddings / video (as applicable)

Handle request mapping, streaming vs non-streaming, response → TanStack types, model constraints. Reference: [text adapter](https://github.com/TanStack/ai/blob/main/packages/ai-openai/src/adapters/text.ts).

## Publish and list

1. Publish the npm package.
2. Open a PR to [TanStack AI](https://github.com/TanStack/ai/pulls).
3. Add the adapter under [docs/community-adapters](https://github.com/TanStack/ai/tree/main/docs/community-adapters).
4. Run `pnpm run sync-docs-config` at monorepo root; PR the nav changes.

## Maintain

- Track provider API changes
- Stay compatible with TanStack AI releases
- Fix user issues
- Update docs on feature or breaking changes
