---
id: createFrozenRegistry
title: createFrozenRegistry
---

# Function: createFrozenRegistry()

```ts
function createFrozenRegistry(tools): ToolRegistry;
```

Defined in: [packages/typescript/ai/src/tool-registry.ts:119](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/tool-registry.ts#L119)

Create a frozen (immutable) tool registry from a tools array.

This is used internally to wrap static `tools` arrays for backward compatibility.
Add and remove operations are no-ops on frozen registries.

## Parameters

### tools

[`Tool`](../interfaces/Tool.md)\<[`SchemaInput`](../type-aliases/SchemaInput.md), [`SchemaInput`](../type-aliases/SchemaInput.md), `string`\>[] = `[]`

The static array of tools

## Returns

[`ToolRegistry`](../interfaces/ToolRegistry.md)

A frozen ToolRegistry
