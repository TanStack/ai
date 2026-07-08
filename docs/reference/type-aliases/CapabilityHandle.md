---
id: CapabilityHandle
title: CapabilityHandle
---

# Type Alias: CapabilityHandle

```ts
type CapabilityHandle = Capability<any, string>;
```

Defined in: [packages/ai/src/activities/chat/middleware/capabilities.ts:54](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/capabilities.ts#L54)

A capability handle with permissive value/name — for use as a constraint in
`requires`/`provides` arrays. Concentrates `any` in one named alias (same
convention as `AnyTextAdapter`/`AnyTool`); needed so `Capability<SpecificT>`
is assignable to the handle-array element type.
