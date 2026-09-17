---
id: WorldGenerationResult
title: WorldGenerationResult
---

Defined in: [packages/ai/src/types.ts:2263](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2263)

**`Experimental`**

Result of world generation. JSON-serializable so a server route can return
it to a browser. The browser uses `token` + `model` to open the live
session (set the prompt, start streaming, steer mid-run).

 World generation is an experimental feature and may change.

## Properties

### expiresAt

```ts
expiresAt: number;
```

Defined in: [packages/ai/src/types.ts:2271](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2271)

**`Experimental`**

Token expiry as milliseconds since epoch

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:2265](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2265)

**`Experimental`**

Unique identifier for this generation

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:2267](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2267)

**`Experimental`**

Model used for generation (provider connect slug)

***

### prompt

```ts
prompt: string;
```

Defined in: [packages/ai/src/types.ts:2273](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2273)

**`Experimental`**

Prompt the client should send when it starts the session

***

### sessionId?

```ts
optional sessionId?: string;
```

Defined in: [packages/ai/src/types.ts:2277](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2277)

**`Experimental`**

Provider session id, when the adapter created one

***

### status

```ts
status: "ready" | "waiting";
```

Defined in: [packages/ai/src/types.ts:2275](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2275)

**`Experimental`**

Session status after the server half finishes

***

### token

```ts
token: string;
```

Defined in: [packages/ai/src/types.ts:2269](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2269)

**`Experimental`**

Short-lived session token for the client connection

***

### usage?

```ts
optional usage?: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:2279](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2279)

**`Experimental`**

Token usage / billing, when the adapter can report it
