---
id: RUN_CANCEL_REASON
title: RUN_CANCEL_REASON
---

# Variable: RUN\_CANCEL\_REASON

```ts
const RUN_CANCEL_REASON: "tanstack-ai:cancel-requested" = 'tanstack-ai:cancel-requested';
```

Defined in: [packages/ai/src/activities/chat/cancel.ts:30](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/cancel.ts#L30)

Abort reason that marks an abort as an explicit cancellation.

Namespaced so an application's own reason string cannot collide with it by
accident, and matched with `===` (never a substring test) so an arbitrary
provider error message can never be read as a deliberate cancel.
