---
id: DebugOption
title: DebugOption
---

# Type Alias: DebugOption

```ts
type DebugOption = boolean | DebugConfig;
```

Defined in: [packages/ai/src/logger/types.ts:83](https://github.com/TanStack/ai/blob/main/packages/ai/src/logger/types.ts#L83)

The shape accepted by the `debug` option on every `@tanstack/ai` activity. Pass `true` to enable all categories with the default console logger; `false` to silence everything including errors; an object for granular control.
