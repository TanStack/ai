---
id: ReasoningOptionFor
title: ReasoningOptionFor
---

```ts
type ReasoningOptionFor<TCapability> = [TCapability] extends [never] ? never : TCapability extends ReasoningCapability ? ReasoningOption<TCapability> : never;
```

Defined in: [packages/ai/src/reasoning.ts:65](https://github.com/TanStack/ai/blob/main/packages/ai/src/reasoning.ts#L65)

The `reasoning` option a model's capability allows. `never` for a model that does not reason.

## Type Parameters

### TCapability

`TCapability`
