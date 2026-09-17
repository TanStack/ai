---
id: LiveVideoGenerationResult
title: LiveVideoGenerationResult
---

Defined in: [packages/ai/src/types.ts:2327](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2327)

**`Experimental`**

Result of live generation. JSON-serializable so a server route can return
it to a browser.

Reactor: connect with `token` and `model` (the connect slug).
fal: `model` is the WMA app id. Open `wma(model)` through a server proxy
that attaches `FAL_KEY`. Do not send `token` as Key credentials.

 Live generation is an experimental feature and may change.

## Properties

### expiresAt

```ts
expiresAt: number;
```

Defined in: [packages/ai/src/types.ts:2338](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2338)

**`Experimental`**

Token expiry as milliseconds since epoch

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:2329](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2329)

**`Experimental`**

Unique identifier for this generation

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:2334](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2334)

**`Experimental`**

Connect id for the browser client. Reactor: `reactor/helios`.
fal: WMA app id `fal-ai/minimax-h3-max-director`.

***

### prompt

```ts
prompt: string;
```

Defined in: [packages/ai/src/types.ts:2340](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2340)

**`Experimental`**

Prompt the client should send when it starts the session

***

### sessionId?

```ts
optional sessionId?: string;
```

Defined in: [packages/ai/src/types.ts:2344](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2344)

**`Experimental`**

Provider session id, when the adapter created one

***

### status

```ts
status: "ready" | "waiting";
```

Defined in: [packages/ai/src/types.ts:2342](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2342)

**`Experimental`**

Session status after the server half finishes

***

### token

```ts
token: string;
```

Defined in: [packages/ai/src/types.ts:2336](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2336)

**`Experimental`**

Short-lived session token. Reactor uses this to connect. fal does not.

***

### usage?

```ts
optional usage?: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:2346](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2346)

**`Experimental`**

Token usage / billing, when the adapter can report it
