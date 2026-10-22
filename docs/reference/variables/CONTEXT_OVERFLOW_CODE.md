---
id: CONTEXT_OVERFLOW_CODE
title: CONTEXT_OVERFLOW_CODE
---

```ts
const CONTEXT_OVERFLOW_CODE: "context_overflow" = 'context_overflow';
```

Defined in: packages/ai/src/activities/error-payload.ts:41

The `RUN_ERROR.code` a text adapter sets when the provider says the input
does not fit in the model's context window. Shorten the messages, then call
the model again. The provider's own text stays in `message`.
