---
id: WorldGenerationResult
title: WorldGenerationResult
---

Defined in: [packages/ai/src/types.ts:2345](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2345)

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

Defined in: [packages/ai/src/types.ts:2353](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2353)

**`Experimental`**

Token expiry as milliseconds since epoch

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:2347](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2347)

**`Experimental`**

Unique identifier for this generation

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:2349](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2349)

**`Experimental`**

Model used for generation (provider connect slug)

***

### prompt

```ts
prompt: string;
```

Defined in: [packages/ai/src/types.ts:2355](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2355)

**`Experimental`**

Prompt the client should send when it starts the session

***

### sessionId?

```ts
optional sessionId?: string;
```

Defined in: [packages/ai/src/types.ts:2359](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2359)

**`Experimental`**

Provider session id, when the adapter created one

***

### status

```ts
status: "ready" | "waiting";
```

Defined in: [packages/ai/src/types.ts:2357](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2357)

**`Experimental`**

Session status after the server half finishes

***

### token

```ts
token: string;
```

Defined in: [packages/ai/src/types.ts:2351](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2351)

**`Experimental`**

Short-lived session token for the client connection

***

### usage?

```ts
optional usage?: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:2361](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2361)

**`Experimental`**

Token usage / billing, when the adapter can report it
