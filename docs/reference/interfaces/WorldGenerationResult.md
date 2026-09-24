---
id: WorldGenerationResult
title: WorldGenerationResult
---

Defined in: [packages/ai/src/types.ts:2285](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2285)

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

Defined in: [packages/ai/src/types.ts:2293](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2293)

**`Experimental`**

Token expiry as milliseconds since epoch

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:2287](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2287)

**`Experimental`**

Unique identifier for this generation

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:2289](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2289)

**`Experimental`**

Model used for generation (provider connect slug)

***

### prompt

```ts
prompt: string;
```

Defined in: [packages/ai/src/types.ts:2295](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2295)

**`Experimental`**

Prompt the client should send when it starts the session

***

### sessionId?

```ts
optional sessionId?: string;
```

Defined in: [packages/ai/src/types.ts:2299](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2299)

**`Experimental`**

Provider session id, when the adapter created one

***

### status

```ts
status: "ready" | "waiting";
```

Defined in: [packages/ai/src/types.ts:2297](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2297)

**`Experimental`**

Session status after the server half finishes

***

### token

```ts
token: string;
```

Defined in: [packages/ai/src/types.ts:2291](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2291)

**`Experimental`**

Short-lived session token for the client connection

***

### usage?

```ts
optional usage?: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:2301](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2301)

**`Experimental`**

Token usage / billing, when the adapter can report it
