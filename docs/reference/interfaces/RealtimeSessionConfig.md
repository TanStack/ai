---
id: RealtimeSessionConfig
title: RealtimeSessionConfig
---

# Interface: RealtimeSessionConfig

Defined in: [packages/typescript/ai/src/realtime/types.ts:30](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/realtime/types.ts#L30)

Configuration for a realtime session

## Properties

### instructions?

```ts
optional instructions: string;
```

Defined in: [packages/typescript/ai/src/realtime/types.ts:36](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/realtime/types.ts#L36)

System instructions for the assistant

***

### maxOutputTokens?

```ts
optional maxOutputTokens: number | "inf";
```

Defined in: [packages/typescript/ai/src/realtime/types.ts:48](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/realtime/types.ts#L48)

Maximum number of tokens in a response

***

### model?

```ts
optional model: string;
```

Defined in: [packages/typescript/ai/src/realtime/types.ts:32](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/realtime/types.ts#L32)

Model to use for the session

***

### outputModalities?

```ts
optional outputModalities: ("text" | "audio")[];
```

Defined in: [packages/typescript/ai/src/realtime/types.ts:44](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/realtime/types.ts#L44)

Output modalities for responses (e.g., ['audio', 'text'], ['text'])

***

### providerOptions?

```ts
optional providerOptions: Record<string, any>;
```

Defined in: [packages/typescript/ai/src/realtime/types.ts:52](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/realtime/types.ts#L52)

Provider-specific options

***

### semanticEagerness?

```ts
optional semanticEagerness: "low" | "medium" | "high";
```

Defined in: [packages/typescript/ai/src/realtime/types.ts:50](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/realtime/types.ts#L50)

Eagerness level for semantic VAD ('low', 'medium', 'high')

***

### temperature?

```ts
optional temperature: number;
```

Defined in: [packages/typescript/ai/src/realtime/types.ts:46](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/realtime/types.ts#L46)

Temperature for generation (provider-specific range, e.g., 0.6-1.2 for OpenAI)

***

### tools?

```ts
optional tools: RealtimeToolConfig[];
```

Defined in: [packages/typescript/ai/src/realtime/types.ts:38](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/realtime/types.ts#L38)

Tools available in the session

***

### vadConfig?

```ts
optional vadConfig: VADConfig;
```

Defined in: [packages/typescript/ai/src/realtime/types.ts:42](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/realtime/types.ts#L42)

VAD configuration

***

### vadMode?

```ts
optional vadMode: "server" | "manual" | "semantic";
```

Defined in: [packages/typescript/ai/src/realtime/types.ts:40](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/realtime/types.ts#L40)

VAD mode

***

### voice?

```ts
optional voice: string;
```

Defined in: [packages/typescript/ai/src/realtime/types.ts:34](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/realtime/types.ts#L34)

Voice to use for audio output
