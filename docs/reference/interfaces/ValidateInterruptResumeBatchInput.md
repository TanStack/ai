---
id: ValidateInterruptResumeBatchInput
title: ValidateInterruptResumeBatchInput
---

# Interface: ValidateInterruptResumeBatchInput

Defined in: [packages/ai/src/interrupt-resume.ts:51](https://github.com/TanStack/ai/blob/main/packages/ai/src/interrupt-resume.ts#L51)

## Properties

### generation

```ts
generation: number;
```

Defined in: [packages/ai/src/interrupt-resume.ts:54](https://github.com/TanStack/ai/blob/main/packages/ai/src/interrupt-resume.ts#L54)

***

### interruptedRunId

```ts
interruptedRunId: string;
```

Defined in: [packages/ai/src/interrupt-resume.ts:53](https://github.com/TanStack/ai/blob/main/packages/ai/src/interrupt-resume.ts#L53)

***

### now?

```ts
optional now?: number;
```

Defined in: [packages/ai/src/interrupt-resume.ts:58](https://github.com/TanStack/ai/blob/main/packages/ai/src/interrupt-resume.ts#L58)

***

### pending

```ts
pending: readonly PendingInterruptResumeRecord[];
```

Defined in: [packages/ai/src/interrupt-resume.ts:55](https://github.com/TanStack/ai/blob/main/packages/ai/src/interrupt-resume.ts#L55)

***

### resume?

```ts
optional resume?: readonly ResumeEntry[];
```

Defined in: [packages/ai/src/interrupt-resume.ts:56](https://github.com/TanStack/ai/blob/main/packages/ai/src/interrupt-resume.ts#L56)

***

### threadId

```ts
threadId: string;
```

Defined in: [packages/ai/src/interrupt-resume.ts:52](https://github.com/TanStack/ai/blob/main/packages/ai/src/interrupt-resume.ts#L52)

***

### tools

```ts
tools: Tool<SchemaInput, SchemaInput, string, unknown>[];
```

Defined in: [packages/ai/src/interrupt-resume.ts:57](https://github.com/TanStack/ai/blob/main/packages/ai/src/interrupt-resume.ts#L57)
