---
id: ToolInputResponse
title: ToolInputResponse
---

```ts
type ToolInputResponse = 
  | {
  payload: unknown;
  status: "resolved";
}
  | {
  status: "cancelled";
};
```

Defined in: [packages/ai/src/types.ts:761](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L761)

The user's answer to an `mcp_input` interrupt.
`resolved` carries the `payload` from `resolveInterrupt`.
`cancelled` means the user called `cancel()`.
