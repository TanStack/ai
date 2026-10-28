---
id: BaseUsageInput
title: BaseUsageInput
---

Defined in: packages/ai/src/utilities/usage.ts:7

Input parameters for building base TokenUsage.
Provider functions should extract these from their SDK's response.

## Properties

### completionTokens

```ts
completionTokens: number;
```

Defined in: packages/ai/src/utilities/usage.ts:11

Total output/completion tokens

***

### promptTokens

```ts
promptTokens: number;
```

Defined in: packages/ai/src/utilities/usage.ts:9

Total input/prompt tokens

***

### totalTokens

```ts
totalTokens: number;
```

Defined in: packages/ai/src/utilities/usage.ts:13

Total tokens (prompt + completion)
