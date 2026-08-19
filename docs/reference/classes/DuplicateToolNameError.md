---
id: DuplicateToolNameError
title: DuplicateToolNameError
---

# Class: DuplicateToolNameError

Defined in: [packages/ai/src/activities/chat/tools/unique-tool-names.ts:11](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/tools/unique-tool-names.ts#L11)

Thrown when `chat({ tools })` (or a provider converter) receives two tools
with the same public `name`.

The common case is a provider-native factory (`webSearchTool()`) next to an
ordinary function that reused the reserved name (`web_search`). Providers
reject that pair, so we fail before the request is built.

## Extends

- `Error`

## Constructors

### Constructor

```ts
new DuplicateToolNameError(toolName, message): DuplicateToolNameError;
```

Defined in: [packages/ai/src/activities/chat/tools/unique-tool-names.ts:14](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/tools/unique-tool-names.ts#L14)

#### Parameters

##### toolName

`string`

##### message

`string`

#### Returns

`DuplicateToolNameError`

#### Overrides

```ts
Error.constructor
```

## Properties

### toolName

```ts
readonly toolName: string;
```

Defined in: [packages/ai/src/activities/chat/tools/unique-tool-names.ts:12](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/tools/unique-tool-names.ts#L12)
